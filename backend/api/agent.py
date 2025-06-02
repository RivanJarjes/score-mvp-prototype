from fastapi import HTTPException, APIRouter, Depends
from pydantic import BaseModel
from google import genai
from google.genai.types import GenerateContentConfig, HttpOptions
from sqlmodel import Session as DBSession, select
import os
import ast
import logging
import datetime as dt
import yaml
from pathlib import Path

from .auth import get_current_user
from ..database.database import get_session
from ..database.db_models import User, ConversationSession, Message
from ..database.helpers import get_user_sessions, get_session_history, SessionListResponse, SessionHistoryResponse

cfg = yaml.safe_load(
    (Path(__file__).resolve().parent.parent / "config.yml").read_text()
)


logger = logging.getLogger(__name__)


router = APIRouter()


class QueryRequest(BaseModel):
    problem: str
    code: str | None = None
    session_id: str | None = None  # optional session ID to continue existing conversation


class QueryResponse(BaseModel):
    response: str
    session_id: str 


def get_syntax_errors(source: str, filename: str = "<string>"):
    try:
        ast.parse(source, filename=filename, mode="exec")
        return None
    except SyntaxError as err:
        return {
            "msg":       err.msg,
            "lineno":    err.lineno,
            "col":       err.offset,
            "end_line":  getattr(err, "end_lineno", None),
            "end_col":   getattr(err, "end_offset", None),
            "text":      err.text.rstrip("\n") if err.text else None,
        }


@router.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest, user: User = Depends(get_current_user), db: DBSession = Depends(get_session)):
    try:
        project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
        if not project_id:
            raise HTTPException(status_code=500, detail="Environment variables is not set")
            
        location = "us-central1"

        current_user_prompt = (
            f"Code:\n{request.code}\n\n"
            f"Problem:\n{request.problem}"
        )
        
        logger.info(f"Received request - Problem: {request.problem}")
        if request.code:
            logger.info(f"Code provided: {request.code}")
        
        conv_session = None
        conversation_history = []
        
        client = genai.Client(http_options=HttpOptions(api_version="v1"), vertexai=True, project=project_id, location=location)
        
        if request.session_id and request.session_id.strip():
            conv_session = db.get(ConversationSession, request.session_id)
            if conv_session and conv_session.user_id != user.id:
                raise HTTPException(status_code=403, detail="Access denied to this session")
            
            # create conversation history context
            if conv_session:
                previous_messages = db.exec(
                    select(Message)
                    .where(Message.conversation_session_id == conv_session.id)
                    .order_by(Message.created_at.asc())
                ).all()
                
                for msg in previous_messages:
                    if msg.role == "user":
                        conversation_history.append(f"User: {msg.content}")
                    else:
                        conversation_history.append(f"Assistant: {msg.content}")
        
        # create a new conversation session if no valid session_id provided or session not found
        if not conv_session:
            # generate a summary using Gemini for the session title
            summary_prompt = f"Problem:\n\n{request.problem}\n\nCode:\n\n{request.code}"
            try:
                logger.info(f"Generating summary with prompt: {summary_prompt[:100]}...")
                summary_response = client.models.generate_content(
                    model=cfg["summary_agent"]["name"],
                    contents=[summary_prompt],
                    config=GenerateContentConfig(
                        system_instruction=cfg["summary_agent"]["system_prompt"],
                        temperature=cfg["summary_agent"]["temperature"],
                        top_p=cfg["summary_agent"]["top_p"],
                        max_output_tokens=cfg["summary_agent"]["tokens"]
                    )
                )
                
                logger.info(f"Raw summary response: {summary_response}")
                logger.info(f"Summary response text: '{summary_response.text}'")
                logger.info(f"Finish reason: {summary_response.candidates[0].finish_reason if summary_response.candidates else 'No candidates'}")
                
                session_title = None
                if summary_response.text:
                    session_title = summary_response.text.strip()
                elif summary_response.candidates and len(summary_response.candidates) > 0:
                    candidate = summary_response.candidates[0]
                    if candidate.content and candidate.content.parts:
                        session_title = "".join([part.text for part in candidate.content.parts if hasattr(part, 'text')]).strip()
                
                # fallback to truncated problem if summary is too long or empty
                if not session_title or len(session_title) > 100:
                    if not session_title:
                        logger.info(f"Session title is empty, using truncated problem")
                    else:
                        logger.info(f"Session title too long ({len(session_title)} chars), using truncated problem")

                    session_title = request.problem[:50] + "..." if len(request.problem) > 50 else request.problem
                else:
                    logger.info(f"Successfully generated session title: '{session_title}'")
            except Exception as e:
                logger.warning(f"Failed to generate session summary: {e}")
                session_title = request.problem[:50] + "..." if len(request.problem) > 50 else request.problem
            
            conv_session = ConversationSession(
                user_id=user.id,
                title=session_title
            )
            db.add(conv_session)
            db.commit()
            db.refresh(conv_session)
            logger.info(f"Created new conversation session: {conv_session.id}")
        else:
            conv_session.updated_at = dt.datetime.now(dt.timezone.utc)
            db.add(conv_session)
            db.commit()
            logger.info(f"Continuing existing conversation session: {conv_session.id}")
        
        user_message = Message(
            conversation_session_id=conv_session.id,
            role="user",
            content=current_user_prompt,
            problem=request.problem,
            code=request.code,
            syntax_errors=str(get_syntax_errors(request.code)) if request.code else None
        )
        
        # prepares the full conversation context
        if conversation_history:
            full_conversation = "\n\n".join(conversation_history) + f"\n\nUser: {current_user_prompt}"
        else:
            full_conversation = current_user_prompt
            
        response = client.models.generate_content(
            model=cfg["support_agent"]["name"],
            contents=[full_conversation],
            config=GenerateContentConfig(
                system_instruction=cfg["support_agent"]["system_prompt"],
                temperature=cfg["support_agent"]["temperature"],
                top_p=cfg["support_agent"]["top_p"],
                max_output_tokens=cfg["support_agent"]["tokens"]
            )
        )
        
        assistant_message = Message(
            conversation_session_id=conv_session.id,
            role="assistant",
            content=response.text
        )
        db.add(user_message)
        db.add(assistant_message)
        db.commit()
        
        return QueryResponse(response=response.text, session_id=conv_session.id)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


"""
Session endpoints
"""

@router.get("/sessions", response_model=SessionListResponse)
async def sessions_endpoint(user: User = Depends(get_current_user), db: DBSession = Depends(get_session)):
    """Get all conversation sessions for the current user"""
    return await get_user_sessions(user, db)


@router.get("/sessions/{session_id}", response_model=SessionHistoryResponse)
async def session_history_endpoint(session_id: str, user: User = Depends(get_current_user), db: DBSession = Depends(get_session)):
    """Get full conversation for a session"""
    return await get_session_history(session_id, user, db)
