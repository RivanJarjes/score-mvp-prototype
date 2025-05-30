from fastapi import HTTPException, APIRouter, Depends
from pydantic import BaseModel
from google import genai
from google.genai.types import GenerateContentConfig, HttpOptions
from sqlmodel import Session as DBSession, select
import os
import ast
import logging
import datetime as dt

from .auth import get_current_user
from .database import get_session
from .db_models import User, ConversationSession, Message

logger = logging.getLogger(__name__)

router = APIRouter()

system_prompt = """
            You are Code-Feedback Mentor. Follow these rules:
            If "Syntax Errors" is not empty, make sure to acknowledge them in your response.
            Give only hints and a question that help the user debug; never paste a full corrected solution.
            Output must be plain text (no markdown, no code fences).
            Be concise, polite, and reference line numbers when helpful.
            If the issue is unclear, ask a clarifying question.
            If the user asks if his answer is correct as a follow-up, answer with "Yes" or "No" and explain why.
            Make sure your response has no titles, headers, newlines, or other formatting.
            DO NOT START YOUR RESPONSE WITH "Hint:" OR ANY FORM OF TITLE.
            """

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
            conv_session = ConversationSession(
                user_id=user.id,
                title=request.problem[:50] + "..." if len(request.problem) > 50 else request.problem
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
        
        client = genai.Client(http_options=HttpOptions(api_version="v1"), vertexai=True, project=project_id, location=location)
            
        response = client.models.generate_content(
            model="gemini-2.5-flash-preview-05-20",
            contents=[full_conversation],
            config=GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.25,
                top_p=0.95,
                max_output_tokens=512
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

class SessionListResponse(BaseModel):
    sessions: list[dict]

class SessionHistoryResponse(BaseModel):
    session_id: str
    title: str | None
    messages: list[dict]

@router.get("/sessions", response_model=SessionListResponse)
async def get_user_sessions(user: User = Depends(get_current_user), db: DBSession = Depends(get_session)):
    """Get all conversation sessions for the current user"""
    sessions = db.exec(
        select(ConversationSession)
        .where(ConversationSession.user_id == user.id)
        .order_by(ConversationSession.updated_at.desc())
    ).all()
    
    session_list = []
    for session in sessions:
        message_count = len(session.messages)
        session_list.append({
            "id": session.id,
            "title": session.title,
            "created_at": session.created_at.isoformat(),
            "updated_at": session.updated_at.isoformat(),
            "message_count": message_count
        })
    
    return SessionListResponse(sessions=session_list)

# get full convo for a session
@router.get("/sessions/{session_id}", response_model=SessionHistoryResponse)
async def get_session_history(session_id: str, user: User = Depends(get_current_user), db: DBSession = Depends(get_session)):
    session = db.get(ConversationSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied to this session")
    
    messages = db.exec(
        select(Message)
        .where(Message.conversation_session_id == session_id)
        .order_by(Message.created_at.asc())
    ).all()
    
    message_list = []
    for msg in messages:
        message_data = {
            "id": msg.id,
            "role": msg.role,
            "content": msg.content,
            "created_at": msg.created_at.isoformat()
        }
        
        if msg.role == "user":
            message_data.update({
                "problem": msg.problem,
                "code": msg.code,
                "syntax_errors": msg.syntax_errors
            })
        
        message_list.append(message_data)
    
    return SessionHistoryResponse(
        session_id=session.id,
        title=session.title,
        messages=message_list
    )
