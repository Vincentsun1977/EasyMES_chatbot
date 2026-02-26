"""Dify API client service."""
import httpx
import json
import logging
from typing import AsyncGenerator, Dict, Any, Optional
from app.config import settings

logger = logging.getLogger(__name__)


def format_mes_result(raw_output: str) -> str:
    """
    格式化 MES 结果，从嵌套的 JSON 中提取并美化显示。
    
    处理多种格式:
    1. {"mes_result":"转序数量: 42"}  - 直接提取 mes_result 值
    2. {"mes_result":"```json\\n{...}\\n```"}
    3. "```json\\n{...}\\n```" (双引号包裹)
    4. [{"key": "...", "value": ...}, ...]
    5. {"output": [...]}
    6. 直接的文本内容
    """
    try:
        content = str(raw_output).strip()
        logger.info(f"=== Format input (first 300 chars): {content[:300]}")
        
        # Step 0: 多次尝试解析嵌套的 JSON，直到提取出最终内容
        max_iterations = 3
        for i in range(max_iterations):
            # 尝试解析为 JSON
            try:
                parsed = json.loads(content)
                logger.info(f"=== Iteration {i+1}: Parsed as JSON, type: {type(parsed)}")
                
                # 如果是字典且包含 mes_result，提取它
                if isinstance(parsed, dict) and 'mes_result' in parsed:
                    content = str(parsed['mes_result'])
                    logger.info(f"=== Extracted mes_result: {content[:200]}")
                    continue  # 继续尝试解析，可能还有嵌套
                
                # 如果解析后仍是字符串，继续下一轮
                if isinstance(parsed, str):
                    content = parsed
                    continue
                    
                # 如果是其他类型（dict、list），跳出循环进行格式化
                content = parsed
                break
                    
            except json.JSONDecodeError:
                logger.info(f"=== Iteration {i+1}: Not valid JSON")
                break  # 不是 JSON，跳出循环
        
        # 现在 content 可能是 str、dict 或 list
        # 如果是字符串，清理代码块标记
        if isinstance(content, str):
            content = content.replace('```json', '').replace('```markdown', '').replace('```', '').strip()
            if (content.startswith('"') and content.endswith('"')) or (content.startswith("'") and content.endswith("'")):
                content = content[1:-1]
            content = content.replace('\\n', '\n')
            
            # Step 2: 检查是否包含多行带冒号的格式（处理逗号分隔的长列表）
            lines = content.split('\n')
            if len(lines) > 1 and any(':' in line for line in lines):
                formatted_lines = []
                for line in lines:
                    if ':' in line:
                        parts = line.split(':', 1)
                        if len(parts) == 2:
                            key = parts[0].strip()
                            value = parts[1].strip()
                            
                            # 检测是否为逗号分隔的长列表（超过10个元素）
                            if ',' in value:
                                items = [item.strip() for item in value.split(',') if item.strip()]
                                if len(items) > 3:
                                    # 使用列表方式显示，每行5个
                                    formatted_lines.append(f"**{key}** ({len(items)}项):")
                                    for i in range(0, len(items), 5):
                                        group = items[i:i+5]
                                        formatted_lines.append("- " + ", ".join(group))
                                else:
                                    # 短列表，保持原样
                                    formatted_lines.append(f"**{key}**: {value}")
                            else:
                                formatted_lines.append(f"**{key}**: {value}")
                        else:
                            formatted_lines.append(line)
                    else:
                        if line.strip():
                            formatted_lines.append(line)
                
                logger.info(f"=== Formatted multi-line with comma-separated lists")
                return '\n'.join(formatted_lines)
            
            # 如果不是 JSON 格式且不是多行格式，直接返回
            if not content.startswith('{') and not content.startswith('['):
                logger.info(f"=== Returning cleaned text")
                return content
            
            # 尝试最后一次解析（可能清理后才能解析）
            try:
                content = json.loads(content)
                logger.info(f"=== Parsed after cleanup: {type(content)}")
            except json.JSONDecodeError:
                logger.info(f"=== Still not valid JSON after cleanup, returning as text")
                return content
        
        # Step 3: 格式化 dict 或 list 类型的数据
        if isinstance(content, list):
            # 处理 [{"key": "...", "value": ...}, ...] 格式 - 转换为表格
            if content and isinstance(content[0], dict):
                if 'key' in content[0] and 'value' in content[0]:
                    # Markdown 表格格式
                    table = "| 项目 | 值 |\n|------|------|\n"
                    for item in content:
                        table += f"| {item['key']} | {item['value']} |\n"
                    logger.info(f"=== Formatted key-value array as table")
                    return table.strip()
                else:
                    # 通用对象数组 - 转换为表格
                    keys = list(content[0].keys())
                    # 表头
                    table = "| " + " | ".join(keys) + " |\n"
                    table += "|" + "------|" * len(keys) + "\n"
                    # 数据行
                    for item in content:
                        values = [str(item.get(k, '')) for k in keys]
                        table += "| " + " | ".join(values) + " |\n"
                    logger.info(f"=== Formatted object array as table")
                    return table.strip()
            
            # 处理普通数组 - 单列表格
            logger.info(f"=== Formatted plain array as list")
            return '\n'.join(f"- {str(item)}" for item in content)
        
        elif isinstance(content, dict):
            # 处理 {"output": [...]} 格式
            if 'output' in content and isinstance(content['output'], list):
                logger.info(f"=== Extracted output array")
                return '\n'.join(str(item) for item in content['output'])
            
            # 处理普通字典 - 转换为两列表格
            if len(content) > 3:  # 如果有多个键值对，使用表格格式
                table = "| 项目 | 值 |\n|------|------|\n"
                for key, value in content.items():
                    table += f"| {key} | {value} |\n"
                logger.info(f"=== Formatted dict as table with {len(content)} items")
                return table.strip()
            else:
                # 少量数据，使用简单格式
                lines = [f"**{key}**: {value}" for key, value in content.items()]
                logger.info(f"=== Formatted dict as simple list")
                return '\n'.join(lines)
        
        # 其他情况，返回字符串形式
        logger.info(f"=== Returning str conversion")
        return str(content)
        
    except Exception as e:
        logger.error(f"=== Format error: {e}", exc_info=True)
        return str(raw_output)


class DifyClient:
    """Client for interacting with Dify API."""
    
    def __init__(self):
        self.api_url = settings.DIFY_API_URL
        self.api_key = settings.DIFY_API_KEY
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    async def send_message(
        self,
        query: str,
        user: str,
        conversation_id: Optional[str] = None,
        inputs: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Send a message to Dify API (blocking mode).
        
        Args:
            query: User message
            user: User identifier
            conversation_id: Optional conversation ID for continuing chat
            inputs: Optional additional inputs
            
        Returns:
            API response as dictionary
        """
        payload = {
            "inputs": inputs or {},
            "query": query,
            "response_mode": "blocking",
            "conversation_id": conversation_id or "",
            "user": user
        }
        
        async with httpx.AsyncClient(timeout=60.0, verify=settings.VERIFY_SSL) as client:
            try:
                logger.info(f"Sending chat message to Dify: {json.dumps(payload, ensure_ascii=False)}")
                response = await client.post(
                    f"{self.api_url}/chat-messages",
                    headers=self.headers,
                    json=payload
                )
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                error_detail = e.response.text
                logger.error(f"Dify API error {e.response.status_code}: {error_detail}")
                raise Exception(f"Dify API error: {e.response.status_code} - {error_detail}")
            except Exception as e:
                logger.error(f"Failed to call Dify API: {str(e)}")
                raise Exception(f"Failed to call Dify API: {str(e)}")

    async def delete_conversation(
        self,
        conversation_id: str,
        user: str
    ) -> None:
        """
        Delete a conversation in Dify.

        Args:
            conversation_id: Conversation ID to delete
            user: User identifier
        """
        payload = {
            "user": user
        }

        async with httpx.AsyncClient(timeout=30.0, verify=settings.VERIFY_SSL) as client:
            try:
                logger.info(f"Deleting conversation in Dify: conversation_id={conversation_id}, user={user}")
                response = await client.request(
                    "DELETE",
                    f"{self.api_url}/conversations/{conversation_id}",
                    headers=self.headers,
                    json=payload
                )

                if response.status_code not in (200, 204):
                    error_detail = response.text
                    logger.error(f"Dify delete conversation error {response.status_code}: {error_detail}")
                    raise Exception(f"Dify API error: {response.status_code} - {error_detail}")
            except Exception as e:
                logger.error(f"Failed to delete conversation in Dify: {str(e)}")
                raise Exception(f"Failed to delete conversation in Dify: {str(e)}")

    async def message_feedback(
        self,
        message_id: str,
        rating: Optional[str] = "like",
        user: str = "",
        content: str = ""
    ) -> Dict[str, Any]:
        """
        Submit message feedback to Dify.

        Args:
            message_id: Message ID
            rating: like/dislike/null
            user: User identifier
            content: Feedback details

        Returns:
            API response
        """
        payload = {
            "rating": rating,
            "user": user,
            "content": content
        }

        async with httpx.AsyncClient(timeout=30.0, verify=settings.VERIFY_SSL) as client:
            try:
                logger.info(f"Submitting message feedback: message_id={message_id}, rating={rating}, user={user}")
                response = await client.post(
                    f"{self.api_url}/messages/{message_id}/feedbacks",
                    headers=self.headers,
                    json=payload
                )
                response.raise_for_status()
                if response.content:
                    return response.json()
                return {"result": "success"}
            except httpx.HTTPStatusError as e:
                error_detail = e.response.text
                logger.error(f"Dify message feedback error {e.response.status_code}: {error_detail}")
                raise Exception(f"Dify API error: {e.response.status_code} - {error_detail}")
            except Exception as e:
                logger.error(f"Failed to submit message feedback in Dify: {str(e)}")
                raise Exception(f"Failed to submit message feedback in Dify: {str(e)}")
    
    async def stream_message(
        self,
        query: str,
        user: str,
        conversation_id: Optional[str] = None,
        inputs: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[str, None]:
        """
        Send a message to Dify API with streaming response.
        
        Args:
            query: User message
            user: User identifier
            conversation_id: Optional conversation ID
            inputs: Optional additional inputs
            
        Yields:
            Streaming response chunks
        """
        payload = {
            "inputs": inputs or {},
            "query": query,
            "response_mode": "streaming",
            "conversation_id": conversation_id or "",
            "user": user
        }
        
        async with httpx.AsyncClient(timeout=120.0, verify=settings.VERIFY_SSL) as client:
            try:
                logger.info(f"=== DIFY STREAMING REQUEST ===")
                logger.info(f"URL: {self.api_url}/chat-messages")
                logger.info(f"Headers: {json.dumps(dict(self.headers), ensure_ascii=False)}")
                logger.info(f"Payload: {json.dumps(payload, ensure_ascii=False, indent=2)}")
                
                async with client.stream(
                    "POST",
                    f"{self.api_url}/chat-messages",
                    headers=self.headers,
                    json=payload
                ) as response:
                    # Log response status
                    logger.info(f"Dify response status: {response.status_code}")
                    
                    if response.status_code != 200:
                        # Read error response
                        error_body = await response.aread()
                        error_text = error_body.decode('utf-8')
                        logger.error(f"Dify API error {response.status_code}: {error_text}")
                        
                        # Try to parse as JSON
                        try:
                            error_json = json.loads(error_text)
                            logger.error(f"Parsed error: {json.dumps(error_json, ensure_ascii=False, indent=2)}")
                        except:
                            pass
                        
                        raise Exception(f"Dify API error: {response.status_code} - {error_text}")
                    
                    # Track if this is a workflow app (receives workflow_finished event)
                    is_workflow_app = False
                    received_message_event = False
                    
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:]
                            if data.strip():
                                try:
                                    event_json = json.loads(data)
                                    event_type = event_json.get("event")
                                    
                                    logger.info(f"=== STREAMING EVENT ===")
                                    logger.info(f"Event Type: {event_type}")
                                    logger.info(f"Raw Data: {data}")
                                    logger.info(f"Parsed JSON: {json.dumps(event_json, ensure_ascii=False, indent=2)}")
                                    
                                    # Handle different chat message events
                                    if event_type == "message":
                                        # Full message event - contains complete answer
                                        logger.info(f"Message event with answer: '{event_json.get('answer', '')[:100]}'")
                                        yield data
                                    elif event_type == "message_end":
                                        # End of message - save conversation_id
                                        logger.info(f"Message end event with conversation_id: {event_json.get('conversation_id', '')}")
                                        yield data
                                    elif event_type == "agent_message" or event_type == "text_chunk":
                                        # Streaming text chunks
                                        logger.info(f"Streaming event {event_type}: {json.dumps(event_json.get('data', {}), ensure_ascii=False)[:200]}")
                                        yield data
                                    elif event_type == "workflow_finished":
                                        # Workflow finished - contains final answer in outputs
                                        # Mark this as a workflow app
                                        is_workflow_app = True
                                        answer = event_json.get('data', {}).get('outputs', {}).get('answer', '')
                                        logger.info(f"Workflow finished detected - this is a workflow app. Skipping stored message event.")
                                        logger.info(f"Workflow finished with answer: {answer[:200]}")
                                        yield data
                                    elif event_type == "node_finished":
                                        # Node finished - for workflow apps, don't send to frontend
                                        # Only workflow_finished should be sent to avoid duplicate display
                                        node_data = event_json.get('data', {})
                                        node_type = node_data.get('node_type', '')
                                        logger.info(f"Node finished ({node_type}) - not sent to frontend (waiting for workflow_finished)")
                                        pass
                                    elif event_type == "agent_thought":
                                        # Agent reasoning - log only, don't yield to frontend
                                        logger.info(f"Agent thought (not sent to frontend): {json.dumps(event_json.get('thought', ''), ensure_ascii=False)[:200]}")
                                        pass
                                    elif event_type == "message_file":
                                        # File attachments
                                        logger.info(f"Message file: {json.dumps(event_json.get('file', {}), ensure_ascii=False)}")
                                        yield data
                                    elif event_type == "workflow_started":
                                        # Workflow started - log only, don't show to user
                                        logger.info(f"Workflow started (not sent to frontend)")
                                        pass
                                    elif event_type == "node_started":
                                        # Node started - log only, don't show to user
                                        logger.info(f"Node started (not sent to frontend)")
                                        pass
                                    elif event_type == "ping":
                                        # Ping event - keep connection alive, don't show to user
                                        logger.debug(f"Ping event received")
                                        pass
                                    else:
                                        # Log unknown events but don't yield (avoid showing unexpected data)
                                        logger.warning(f"Unknown event type (not sent to frontend): {event_type}")
                                        pass
                                        
                                except Exception as e:
                                    logger.warning(f"Failed to parse event json: {e}, raw: {data}")
            except httpx.HTTPStatusError as e:
                error_msg = f"Dify API error: {e.response.status_code}"
                try:
                    error_detail = await e.response.aread()
                    decoded_error = error_detail.decode()
                    error_msg += f" - {decoded_error}"
                    logger.error(f"Dify streaming error {e.response.status_code}: {decoded_error}")
                except:
                    pass
                raise Exception(error_msg)
            except Exception as e:
                if "Dify API error" not in str(e):
                    logger.error(f"Failed to stream from Dify API: {str(e)}")
                raise Exception(f"Failed to stream from Dify API: {str(e)}")
    
    async def get_conversations(
        self, 
        user: str,
        last_id: Optional[str] = None,
        limit: int = 20,
        sort_by: str = "-updated_at"
    ) -> Dict[str, Any]:
        """
        Get conversation history for a user.
        
        Args:
            user: User identifier
            last_id: Optional last conversation ID for pagination
            limit: Number of records to return (default 20, max 100)
            sort_by: Sort field, default -updated_at (desc by updated time)
            
        Returns:
            List of conversations with pagination info
        """
        params = {
            "user": user,
            "limit": limit,
            "sort_by": sort_by
        }
        if last_id:
            params["last_id"] = last_id
        
        logger.info(f"=== GET CONVERSATIONS ===")
        logger.info(f"Request URL: {self.api_url}/conversations")
        logger.info(f"Request Params: {json.dumps(params, ensure_ascii=False)}")
            
        async with httpx.AsyncClient(timeout=30.0, verify=settings.VERIFY_SSL) as client:
            try:
                response = await client.get(
                    f"{self.api_url}/conversations",
                    headers=self.headers,
                    params=params
                )
                response.raise_for_status()
                result = response.json()
                logger.info(f"=== CONVERSATIONS RESPONSE ===")
                logger.info(f"Response Status: {response.status_code}")
                logger.info(f"Full Response: {json.dumps(result, ensure_ascii=False, indent=2)}")
                if 'data' in result:
                    logger.info(f"Number of conversations: {len(result['data'])}")
                    for idx, conv in enumerate(result['data']):
                        logger.info(f"Conversation {idx + 1}:")
                        logger.info(f"  - ID: {conv.get('id', 'N/A')}")
                        logger.info(f"  - Name: {conv.get('name', 'N/A')}")
                        logger.info(f"  - Status: {conv.get('status', 'N/A')}")
                        logger.info(f"  - Created at: {conv.get('created_at', 'N/A')}")
                        logger.info(f"  - Updated at: {conv.get('updated_at', 'N/A')}")
                return result
            except httpx.HTTPStatusError as e:
                logger.error(f"Dify API HTTP error: {e.response.status_code}")
                logger.error(f"Error response: {e.response.text}")
                raise Exception(f"Dify API error: {e.response.status_code} - {e.response.text}")
            except Exception as e:
                logger.error(f"Failed to get conversations: {str(e)}")
                raise Exception(f"Failed to get conversations: {str(e)}")
    
    async def get_conversation_messages(
        self,
        conversation_id: str,
        user: str
    ) -> Dict[str, Any]:
        """
        Get messages for a specific conversation.
        
        Args:
            conversation_id: Conversation ID
            user: User identifier
            
        Returns:
            List of messages in the conversation
        """
        params = {"user": user}
        logger.info(f"=== GET CONVERSATION MESSAGES ===")
        logger.info(f"Conversation ID: {conversation_id}")
        logger.info(f"User: {user}")
        logger.info(f"Request URL: {self.api_url}/messages")
        logger.info(f"Request Params: {json.dumps({**params, 'conversation_id': conversation_id}, ensure_ascii=False)}")
            
        async with httpx.AsyncClient(timeout=30.0, verify=settings.VERIFY_SSL) as client:
            try:
                response = await client.get(
                    f"{self.api_url}/messages",
                    headers=self.headers,
                    params={**params, "conversation_id": conversation_id}
                )
                response.raise_for_status()
                result = response.json()
                logger.info(f"=== CONVERSATION MESSAGES RESPONSE ===")
                logger.info(f"Response Status: {response.status_code}")
                logger.info(f"Full Response: {json.dumps(result, ensure_ascii=False, indent=2)}")
                if 'data' in result:
                    logger.info(f"Number of messages: {len(result['data'])}")
                    for idx, msg in enumerate(result['data']):
                        logger.info(f"Message {idx + 1}:")
                        logger.info(f"  - Query: {msg.get('query', 'N/A')}")
                        logger.info(f"  - Answer: {msg.get('answer', 'N/A')[:200]}...")
                        logger.info(f"  - Created at: {msg.get('created_at', 'N/A')}")
                return result
            except httpx.HTTPStatusError as e:
                logger.error(f"Dify API HTTP error: {e.response.status_code}")
                logger.error(f"Error response: {e.response.text}")
                raise Exception(f"Dify API error: {e.response.status_code} - {e.response.text}")
            except Exception as e:
                raise Exception(f"Failed to get conversation messages: {str(e)}")


# Global client instance
dify_client = DifyClient()

# 将 API 返回结果转换为 Markdown 格式，便于页面显示
def convert_response_to_markdown(response):
    """
    将 API 响应结果转换为页面友好格式，去除 json/markdown 代码块符号。
    """
    import json
    def clean_text(text):
        # 去除 markdown/json 代码块标记
        for tag in ["```json", "```markdown", "```"]:
            text = text.replace(tag, "")
        return text.strip()

    if isinstance(response, dict):
        # 只显示 mes_result 字段内容（如有）
        if "mes_result" in response:
            return clean_text(str(response["mes_result"]))
        md = []
        for key, value in response.items():
            md.append(f"{key}: {value}")
        return '\n'.join(md)
    elif isinstance(response, list):
        md = [clean_text(str(item)) for item in response]
        return '\n'.join(md)
    elif isinstance(response, str):
        return clean_text(response)
    else:
        return clean_text(json.dumps(response, ensure_ascii=False, indent=2))
