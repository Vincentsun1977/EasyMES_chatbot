"""Chat API endpoints."""
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from app.models.schemas import ChatRequest, ChatResponse, ErrorResponse, ConversationDeleteRequest, MessageFeedbackRequest
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
        logger.info(f"=== CHAT API REQUEST ===")
        logger.info(f"Query: '{request.query}'")
        logger.info(f"User: {request.user}")
        logger.info(f"Conversation ID: {request.conversation_id}")
        logger.info(f"Inputs: {request.inputs}")
        
        response = await dify_client.send_message(
            query=request.query,
            user=request.user,
            conversation_id=request.conversation_id,
            inputs=request.inputs
        )
        
        logger.info(f"=== CHAT API RESPONSE ===")
        logger.info(f"Dify Response: {json.dumps(response, ensure_ascii=False, indent=2)}")
        
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
    logger.info(f"=== CHAT STREAM API REQUEST ===")
    logger.info(f"Query: '{request.query}'")
    logger.info(f"User: {request.user}")
    logger.info(f"Conversation ID: {request.conversation_id}")
    logger.info(f"Inputs: {request.inputs}")
    
    async def event_generator():
        chunk_count = 0
        try:
            async for chunk in dify_client.stream_message(
                query=request.query,
                user=request.user,
                conversation_id=request.conversation_id,
                inputs=request.inputs
            ):
                chunk_count += 1
                logger.info(f"=== STREAM CHUNK {chunk_count} ===")
                logger.info(f"Chunk: {chunk}")
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
            employee_id = request_data.get("user") or request_data.get("employee_id")
            inputs = request_data.get("inputs", {})
            
            if not query:
                await websocket.send_json({
                    "type": "error",
                    "message": "Query is required"
                })
                continue

            if not employee_id:
                await websocket.send_json({
                    "type": "error",
                    "message": "User identifier is required"
                })
                continue
            
            # Stream response back to client
            try:
                async for chunk in dify_client.stream_message(
                    query=query,
                    user=employee_id,
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
async def get_conversations(
    user: str,
    last_id: str = None,
    limit: int = 20,
    sort_by: str = "created_at"
):
    """
    Get conversation history for a user.
    
    Args:
        user: User identifier
        last_id: Optional last conversation ID for pagination
        limit: Number of records to return (default 20, max 100)
        sort_by: Sort field, default created_at (oldest first)
        
    Returns:
        List of conversations with pagination info
    """
    try:
        logger.info(f"=== API: GET CONVERSATIONS ===")
        logger.info(f"User: {user}, Limit: {limit}, Sort by: {sort_by}")
        
        conversations = await dify_client.get_conversations(
            user=user,
            last_id=last_id,
            limit=limit,
            sort_by=sort_by
        )
        
        logger.info(f"=== API: RETURNING CONVERSATIONS ===")
        logger.info(f"Total conversations: {len(conversations.get('data', []))}")
        logger.info(f"Has more: {conversations.get('has_more', False)}")
        
        return conversations
    except Exception as e:
        logger.error(f"Error getting conversations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: str, user: str):
    """
    Get messages for a specific conversation.
    
    Args:
        conversation_id: Conversation ID
        user: User identifier
        
    Returns:
        List of messages in the conversation
    """
    try:
        logger.info(f"=== API: GET CONVERSATION MESSAGES ===")
        logger.info(f"Conversation ID: {conversation_id}")
        logger.info(f"User: {user}")
        
        messages = await dify_client.get_conversation_messages(
            conversation_id=conversation_id,
            user=user
        )
        
        logger.info(f"=== API: RETURNING MESSAGES ===")
        logger.info(f"Total messages: {len(messages.get('data', []))}")
        logger.info(f"Has more: {messages.get('has_more', False)}")
        logger.info(f"Full response: {json.dumps(messages, ensure_ascii=False, indent=2)}")
        
        return messages
    except Exception as e:
        logger.error(f"Error getting conversation messages: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, request: ConversationDeleteRequest):
    """
    Delete a specific conversation.

    Args:
        conversation_id: Conversation ID
        request: Request body containing user identifier

    Returns:
        Delete result
    """
    try:
        logger.info(f"=== API: DELETE CONVERSATION ===")
        logger.info(f"Conversation ID: {conversation_id}")
        logger.info(f"User: {request.user}")

        await dify_client.delete_conversation(
            conversation_id=conversation_id,
            user=request.user
        )

        return {"result": "success"}
    except Exception as e:
        logger.error(f"Error deleting conversation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/messages/{message_id}/feedbacks")
async def message_feedback(message_id: str, request: MessageFeedbackRequest):
    """
    Submit feedback for a specific message.

    Args:
        message_id: Message ID
        request: Feedback request body

    Returns:
        Feedback result
    """
    try:
        logger.info(f"=== API: MESSAGE FEEDBACK ===")
        logger.info(f"Message ID: {message_id}")
        logger.info(f"Rating: {request.rating}")
        logger.info(f"User: {request.user}")

        result = await dify_client.message_feedback(
            message_id=message_id,
            rating=request.rating,
            user=request.user,
            content=request.content
        )

        return result
    except Exception as e:
        logger.error(f"Error submitting message feedback: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
