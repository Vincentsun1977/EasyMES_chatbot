"""Chat API endpoints."""
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from app.models.schemas import ChatRequest, ChatResponse, ErrorResponse
from app.services.dify_client import dify_client
import json
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Send a message to the chatbot (blocking mode).
    
    Args:
        request: Chat request with query and optional conversation_id
        
    Returns:
        Chat response with answer and conversation_id
    """
    try:
        response = await dify_client.send_message(
            query=request.query,
            user=request.user,
            conversation_id=request.conversation_id,
            inputs=request.inputs
        )
        
        return ChatResponse(
            answer=response.get("answer", ""),
            conversation_id=response.get("conversation_id", ""),
            message_id=response.get("message_id", ""),
            created_at=response.get("created_at")
        )
    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    Send a message with streaming response.
    
    Args:
        request: Chat request
        
    Returns:
        Server-Sent Events stream
    """
    async def event_generator():
        try:
            async for chunk in dify_client.stream_message(
                query=request.query,
                user=request.user,
                conversation_id=request.conversation_id,
                inputs=request.inputs
            ):
                # Forward the SSE event
                yield f"data: {chunk}\n\n"
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Stream error: {error_msg}")
            logger.error(f"Full error details: {repr(e)}")
            error_data = json.dumps({"error": error_msg})
            yield f"data: {error_data}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@router.websocket("/chat/ws")
async def chat_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time chat.
    
    Client sends JSON: {"query": "message", "conversation_id": "optional", "user": "user-id"}
    Server sends JSON: {"type": "chunk", "data": {...}} or {"type": "error", "message": "..."}
    """
    await websocket.accept()
    logger.info("WebSocket connection established")
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            request_data = json.loads(data)
            
            query = request_data.get("query")
            conversation_id = request_data.get("conversation_id")
            user = request_data.get("user", "default-user")
            inputs = request_data.get("inputs", {})
            
            if not query:
                await websocket.send_json({
                    "type": "error",
                    "message": "Query is required"
                })
                continue
            
            # Stream response back to client
            try:
                async for chunk in dify_client.stream_message(
                    query=query,
                    user=user,
                    conversation_id=conversation_id,
                    inputs=inputs
                ):
                    try:
                        chunk_data = json.loads(chunk)
                        await websocket.send_json({
                            "type": "chunk",
                            "data": chunk_data
                        })
                    except json.JSONDecodeError:
                        logger.warning(f"Failed to parse chunk: {chunk}")
                        
            except Exception as e:
                logger.error(f"Error streaming message: {str(e)}")
                await websocket.send_json({
                    "type": "error",
                    "message": str(e)
                })
                
    except WebSocketDisconnect:
        logger.info("WebSocket connection closed")
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        try:
            await websocket.close()
        except:
            pass


@router.get("/conversations")
async def get_conversations(user: str = "default-user"):
    """
    Get conversation history for a user.
    
    Args:
        user: User identifier
        
    Returns:
        List of conversations
    """
    try:
        conversations = await dify_client.get_conversations(user=user)
        return conversations
    except Exception as e:
        logger.error(f"Error getting conversations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
