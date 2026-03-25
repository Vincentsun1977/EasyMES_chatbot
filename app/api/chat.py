"""Chat API endpoints."""
import asyncio
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from app.models.schemas import ChatRequest, ChatResponse, ErrorResponse, ConversationDeleteRequest, MessageFeedbackRequest
from app.services.dify_client import dify_client
import json
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

STREAM_HEARTBEAT_INTERVAL_SECONDS = 15


def build_stream_error_payload(error_msg: str) -> dict:
    """Build structured stream error payload for frontend classification."""
    lower_msg = str(error_msg).lower()

    if (
        "settings" in lower_msg
        or "has no attribute" in lower_msg
        or "attributeerror" in lower_msg
        or "missing" in lower_msg
        or "configuration" in lower_msg
    ):
        return {
            "event": "error",
            "error": error_msg,
            "error_type": "config_error",
            "user_message": "服务配置异常，请联系管理员检查配置。",
        }

    if (
        "gateway" in lower_msg
        or "504" in lower_msg
        or "timed out" in lower_msg
        or "timeout" in lower_msg
        or "read timeout" in lower_msg
        or "remoteprotocolerror" in lower_msg
        or "http2" in lower_msg
        or "protocol error" in lower_msg
    ):
        return {
            "event": "error",
            "error": error_msg,
            "error_type": "gateway_timeout",
            "user_message": "请求超时（可能是网关超时），请稍后重试。",
        }

    if (
        "failed to fetch" in lower_msg
        or "network" in lower_msg
        or "connection" in lower_msg
        or "connecterror" in lower_msg
        or "readerror" in lower_msg
        or "server disconnected" in lower_msg
    ):
        return {
            "event": "error",
            "error": error_msg,
            "error_type": "network_error",
            "user_message": "网络连接异常，请检查网络后重试。",
        }

    if "dify api error" in lower_msg:
        return {
            "event": "error",
            "error": error_msg,
            "error_type": "dify_api_error",
            "user_message": "Dify 服务返回异常，请稍后重试。",
        }

    return {
        "event": "error",
        "error": error_msg,
        "error_type": "unknown",
        "user_message": f"发生错误：{error_msg}",
    }


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
        logger.info(f"Trace ID: {request.trace_id}")
        logger.info(f"Inputs: {request.inputs}")
        
        response = await dify_client.send_message(
            query=request.query,
            user=request.user,
            conversation_id=request.conversation_id,
            inputs=request.inputs,
            trace_id=request.trace_id
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
    logger.info(f"Trace ID: {request.trace_id}")
    logger.info(f"Inputs: {request.inputs}")
    
    async def event_generator():
        chunk_count = 0
        queue: asyncio.Queue = asyncio.Queue()
        stream_done = asyncio.Event()

        async def producer():
            nonlocal chunk_count
            try:
                async for chunk in dify_client.stream_message(
                    query=request.query,
                    user=request.user,
                    conversation_id=request.conversation_id,
                    inputs=request.inputs,
                    trace_id=request.trace_id
                ):
                    chunk_count += 1
                    logger.info(f"=== STREAM CHUNK {chunk_count} ===")
                    logger.info(f"Chunk: {chunk}")
                    await queue.put(("chunk", chunk))
            except Exception as e:
                await queue.put(("error", e))
            finally:
                stream_done.set()

        producer_task = asyncio.create_task(producer())

        try:
            while True:
                if stream_done.is_set() and queue.empty():
                    break

                try:
                    kind, payload = await asyncio.wait_for(
                        queue.get(),
                        timeout=STREAM_HEARTBEAT_INTERVAL_SECONDS
                    )
                except asyncio.TimeoutError:
                    heartbeat_data = json.dumps({"event": "ping"})
                    yield f"data: {heartbeat_data}\n\n"
                    continue

                if kind == "chunk":
                    yield f"data: {payload}\n\n"
                elif kind == "error":
                    raise payload
        except Exception as e:
            error_msg = str(e).strip() or repr(e)
            logger.error(f"Stream error: {error_msg}")
            logger.error(f"Full error details: {repr(e)}")
            error_data = json.dumps(build_stream_error_payload(error_msg), ensure_ascii=False)
            yield f"data: {error_data}\n\n"
        finally:
            if not producer_task.done():
                producer_task.cancel()
                try:
                    await producer_task
                except asyncio.CancelledError:
                    pass
    
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
    sort_by: str = "-updated_at"
):
    """
    Get conversation history for a user.
    
    Args:
        user: User identifier
        last_id: Optional last conversation ID for pagination
        limit: Number of records to return (default 20, max 100)
        sort_by: Sort field, default -updated_at (latest updated first)
        
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
