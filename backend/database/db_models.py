import uuid, datetime as dt
from sqlmodel import SQLModel, Field, Relationship
from typing import List, Optional

class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    hashed_password: str
    is_active: bool = True
    student: bool = True
    auth_sessions: List["AuthSession"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete"})
    conversation_sessions: List["ConversationSession"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete"})
    #instruction_sessions: List["InstructionSessions"]


class AuthSession(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    expires_at: dt.datetime
    user: Optional[User] = Relationship(back_populates="auth_sessions")


class ConversationSession(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    title: str | None = None  # problem title for the conversation
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    updated_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    user: Optional[User] = Relationship(back_populates="conversation_sessions")
    messages: List["Message"] = Relationship(back_populates="conversation_session", sa_relationship_kwargs={"cascade": "all, delete"})
    last_topic: str | None = None  # last topic of the conversation
    current_topic_length: int = 0  # current topic length


class Message(SQLModel, table=True):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex, primary_key=True)
    conversation_session_id: str = Field(foreign_key="conversationsession.id")
    role: str  # "user" or "assistant"  
    content: str  # assistant message content
    problem: str | None = None  # user problem description
    code: str | None = None  # user code provided
    syntax_errors: str | None = None  # assistant syntax errors detected
    frustration_score: float | None = None  # frustration probability score for user messages (None for assistant messages)
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    conversation_session: Optional[ConversationSession] = Relationship(back_populates="messages")

"""
class InstructionSessions(SqlMode, table=True):
"""
