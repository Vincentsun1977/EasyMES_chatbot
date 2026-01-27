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
        user: str = "default-user",
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
        # Dify workflow API uses inputs to pass the query
        # Note: The input parameter name should match your workflow definition
        workflow_inputs = inputs or {}
        if query:
            workflow_inputs["input"] = query  # Changed from "query" to "input"
        
        payload = {
            "inputs": workflow_inputs,
            "response_mode": "blocking",
            "user": user
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                logger.info(f"Sending request to Dify: {json.dumps(payload, ensure_ascii=False)}")
                response = await client.post(
                    f"{self.api_url}/workflows/run",
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
    
    async def stream_message(
        self,
        query: str,
        user: str = "default-user",
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
        # Dify workflow API uses inputs to pass the query
        # Note: The input parameter name should match your workflow definition
        workflow_inputs = inputs or {}
        if query:
            workflow_inputs["input"] = query  # Changed from "query" to "input"
        
        payload = {
            "inputs": workflow_inputs,
            "response_mode": "streaming",
            "user": user
        }
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                logger.info(f"Streaming request to Dify: {json.dumps(payload, ensure_ascii=False)}")
                async with client.stream(
                    "POST",
                    f"{self.api_url}/workflows/run",
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
                    
                    # response.raise_for_status()
                    
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data = line[6:]
                            if data.strip():
                                try:
                                    event_json = json.loads(data)
                                    # Only yield when event is workflow_finished
                                    if event_json.get("event") == "workflow_finished":
                                        # 格式化输出结果
                                        if event_json.get("data") and event_json["data"].get("outputs"):
                                            outputs = event_json["data"]["outputs"]
                                            logger.info(f"Outputs keys: {list(outputs.keys())}")
                                            logger.info(f"Outputs content: {json.dumps(outputs, ensure_ascii=False)[:300]}")
                                            
                                            # 尝试所有可能的字段名
                                            raw_result = (outputs.get("text") or outputs.get("result") or 
                                                        outputs.get("output") or outputs.get("mes_result") or
                                                        outputs.get("answer"))
                                            
                                            # 如果没有找到常见字段，尝试获取第一个字段的值
                                            if not raw_result and outputs:
                                                first_key = list(outputs.keys())[0]
                                                raw_result = outputs[first_key]
                                                logger.info(f"Using first key '{first_key}' with value: {str(raw_result)[:200]}")
                                            
                                            if raw_result:
                                                logger.info(f"Raw result type: {type(raw_result)}, value: {str(raw_result)[:200]}")
                                                # 格式化结果
                                                formatted_result = format_mes_result(str(raw_result))
                                                logger.info(f"Formatted result: {formatted_result[:200]}")
                                                # 重新构造事件数据，替换为格式化后的结果
                                                event_json["data"]["outputs"]["text"] = formatted_result
                                                event_json["data"]["outputs"]["result"] = formatted_result
                                                event_json["data"]["outputs"]["output"] = formatted_result
                                                formatted_data = json.dumps(event_json, ensure_ascii=False)
                                                logger.info(f"Yielding formatted data")
                                                yield formatted_data
                                            else:
                                                logger.info(f"No result found in outputs, yielding original")
                                                yield data
                                        else:
                                            logger.info(f"No outputs in data, yielding original")
                                            yield data
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
    
    async def get_conversations(self, user: str = "default-user") -> Dict[str, Any]:
        """
        Get conversation history for a user.
        
        Args:
            user: User identifier
            
        Returns:
            List of conversations
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(
                    f"{self.api_url}/conversations",
                    headers=self.headers,
                    params={"user": user}
                )
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                raise Exception(f"Dify API error: {e.response.status_code} - {e.response.text}")
            except Exception as e:
                raise Exception(f"Failed to get conversations: {str(e)}")


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
