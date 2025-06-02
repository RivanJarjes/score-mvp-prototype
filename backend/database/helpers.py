from sqlmodel import Session as DBSession, select
from pydantic import BaseModel
from fastapi import HTTPException, Depends

from .db_models import User, ConversationSession, Message
from ..api.auth import get_current_user
from .database import get_session

class SessionListResponse(BaseModel):
    sessions: list[dict]


class SessionHistoryResponse(BaseModel):
    session_id: str
    title: str | None
    messages: list[dict]


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


async def get_session_history(session_id: str, user: User = Depends(get_current_user), db: DBSession = Depends(get_session)):
    """Get full conversation for a session"""
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
