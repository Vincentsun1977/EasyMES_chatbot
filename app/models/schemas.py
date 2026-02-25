"""Data models and schemas."""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime


class ChatRequest(BaseModel):
    """Chat request model."""
    query: str = Field(..., description="User message", min_length=1)
    conversation_id: Optional[str] = Field(None, description="Conversation ID for continuing chat")
    user: str = Field(default="CNHUSUN", description="User identifier")
    inputs: Dict[str, Any] = Field(default_factory=dict, description="Additional inputs")


class ChatResponse(BaseModel):
    """Chat response model."""
    answer: str = Field(..., description="AI response")
    conversation_id: str = Field(..., description="Conversation ID")
    message_id: str = Field(..., description="Message ID")
    created_at: Optional[int] = Field(None, description="Creation timestamp")


class ConversationDeleteRequest(BaseModel):
    """Conversation delete request model."""
    user: str = Field(default="CNHUSUN", description="User identifier")


class MessageFeedbackRequest(BaseModel):
    """Message feedback request model."""
    rating: Optional[str] = Field(default="like", description="Feedback rating: like/dislike/null")
    user: str = Field(default="CNHUSUN", description="User identifier")
    content: str = Field(default="", description="Feedback details")


class ErrorResponse(BaseModel):
    """Error response model."""
    error: str = Field(..., description="Error message")
    detail: Optional[str] = Field(None, description="Error details")


class HealthResponse(BaseModel):
    """Health check response."""
    status: str = Field(default="healthy")
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    dify_api_url: str
