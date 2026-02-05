// Chatbot JavaScript
console.log('=== Chat.js loaded successfully ===');
console.log('Current timestamp:', new Date().toISOString());

class ChatBot {
    constructor() {
        this.conversationId = null;
        this.userId = this.generateUserId();
        this.isStreaming = false;
        this.isWorkflowApp = false; // 标记是否为 workflow 应用
        this.abortController = null; // 用于中断请求
        
        // DOM elements
        this.chatMessages = document.getElementById('chatMessages');
        this.chatForm = document.getElementById('chatForm');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.clearBtn = document.getElementById('clearBtn');
        
        this.init();
    }
    
    init() {
        // Event listeners
        this.chatForm.addEventListener('submit', (e) => this.handleSubmit(e));
        // 使用 click 事件，按钮类型改为 button 避免自动提交
        this.sendBtn.addEventListener('click', (e) => this.handleSendButtonClick(e));
        this.clearBtn.addEventListener('click', () => this.clearChat());
        
        // Auto-resize textarea
        this.messageInput.addEventListener('input', () => this.autoResize());
        
        // Enter to send, Shift+Enter for new line
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!this.isStreaming) {
                    this.chatForm.dispatchEvent(new Event('submit'));
                }
            }
        });
        
        // 移动端虚拟键盘处理
        this.handleMobileKeyboard();
        
        // 移动端触摸优化
        this.setupTouchOptimizations();
        
        console.log('ChatBot initialized');
    }
    
    // 移动端虚拟键盘处理
    handleMobileKeyboard() {
        // 检测是否为移动设备
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (!isMobile) return;
        
        // 虚拟键盘弹出时，调整视图
        this.messageInput.addEventListener('focus', () => {
            setTimeout(() => {
                this.scrollToBottom();
                // 在iOS上防止页面缩放
                if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                    document.body.style.position = 'fixed';
                    document.body.style.width = '100%';
                }
            }, 300);
        });
        
        // 虚拟键盘隐藏时，恢复视图
        this.messageInput.addEventListener('blur', () => {
            if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                document.body.style.position = '';
                document.body.style.width = '';
            }
        });
        
        // 监听视口大小变化（虚拟键盘弹出/隐藏）
        let lastHeight = window.innerHeight;
        window.addEventListener('resize', () => {
            const currentHeight = window.innerHeight;
            if (currentHeight < lastHeight) {
                // 虚拟键盘弹出
                setTimeout(() => this.scrollToBottom(), 100);
            }
            lastHeight = currentHeight;
        });
    }
    
    // 移动端触摸优化
    setupTouchOptimizations() {
        // 阻止双击缩放
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
        
        // 优化滚动性能
        this.chatMessages.style.webkitOverflowScrolling = 'touch';
        
        // 为按钮添加触摸反馈
        [this.sendBtn, this.clearBtn].forEach(btn => {
            btn.addEventListener('touchstart', () => {
                btn.style.opacity = '0.7';
            });
            btn.addEventListener('touchend', () => {
                btn.style.opacity = '1';
            });
        });
    }
    
    handleSendButtonClick(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if (this.isStreaming) {
            // 正在流式传输，点击停止
            console.log('Stopping stream...');
            this.stopStreaming();
        } else {
            // 直接调用 handleSubmit
            console.log('Button clicked, calling handleSubmit...');
            const fakeEvent = { preventDefault: () => {} };
            this.handleSubmit(fakeEvent);
        }
    }
    
    stopStreaming() {
        console.log('=== STOPPING STREAM ===');
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.isStreaming = false;
        this.userStopped = true; // 标记用户主动停止
        this.updateSendButton(false);
        console.log('Stream stopped by user');
    }
    
    updateSendButton(isStreaming) {
        const svg = this.sendBtn.querySelector('svg');
        if (isStreaming) {
            // 停止图标 (方块)
            svg.innerHTML = '<rect x="6" y="6" width="12" height="12" fill="currentColor" stroke="none"/>';
            this.sendBtn.title = '停止生成';
        } else {
            // 发送图标 (纸飞机)
            svg.innerHTML = '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>';
            this.sendBtn.title = '发送消息';
        }
    }
    
    generateUserId() {
        // Generate or retrieve user ID from localStorage
        let userId = localStorage.getItem('chatbot_user_id');
        if (!userId) {
            userId = 'user_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('chatbot_user_id', userId);
        }
        return userId;
    }
    
    // 增强版 Markdown 转换为 HTML
    markdownToHtml(markdown) {
        let html = markdown;
        
        // 保留 HTML 标签（如 details, summary）
        const htmlTags = /<(details|summary|\/details|\/summary|pre|code|\/pre|\/code)>/g;
        const preservedTags = [];
        html = html.replace(htmlTags, (match) => {
            preservedTags.push(match);
            return `__HTML_TAG_${preservedTags.length - 1}__`;
        });
        
        // 转换代码块 ```language code``` 
        html = html.replace(/```([\w]*)?\n?([\s\S]*?)```/g, (match, language, code) => {
            const lang = language || 'text';
            return `<pre class="code-block ${lang}"><code>${this.escapeHtml(code.trim())}</code></pre>`;
        });
        
        // 转换行内代码 `code`
        html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        
        // 转换引用块 > text
        html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
        
        // 检测并转换 Markdown 表格
        const tableRegex = /\|(.+)\|\n\|[-:\s|]+\|\n((?:\|.+\|\n?)+)/g;
        html = html.replace(tableRegex, (match, header, body) => {
            const headers = header.split('|').map(h => h.trim()).filter(h => h);
            const rows = body.trim().split('\n').map(row => 
                row.split('|').map(cell => cell.trim()).filter(cell => cell)
            );
            
            let table = '<table class="mes-table"><thead><tr>';
            headers.forEach(h => table += `<th>${h}</th>`);
            table += '</tr></thead><tbody>';
            rows.forEach(row => {
                table += '<tr>';
                row.forEach(cell => table += `<td>${cell}</td>`);
                table += '</tr>';
            });
            table += '</tbody></table>';
            return table;
        });
        
        // 转换标题 ## text
        html = html.replace(/^### (.+)$/gm, '<h3 class="markdown-h3">$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2 class="markdown-h2">$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1 class="markdown-h1">$1</h1>');
        
        // 转换粗体文本 **text**
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        
        // 转换斜体文本 *text*
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        
        // 转换有序列表 1. text (必须是行首，且点后有空格)
        html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<li class="ordered">$2</li>');
        if (html.includes('<li class="ordered">')) {
            html = html.replace(/(<li class="ordered">.*<\/li>\n?)+/g, (match) => `<ol>${match.replace(/ class="ordered"/g, '')}</ol>`);
        }
        
        // 转换无序列表 - text
        html = html.replace(/^- (.+)$/gm, '<li class="unordered">$1</li>');
        if (html.includes('<li class="unordered">')) {
            html = html.replace(/(<li class="unordered">.*<\/li>\n?)+/g, (match) => `<ul>${match.replace(/ class="unordered"/g, '')}</ul>`);
        }
        
        // 转换换行符
        html = html.replace(/\n/g, '<br>');
        
        // 恢复 HTML 标签
        preservedTags.forEach((tag, index) => {
            html = html.replace(`__HTML_TAG_${index}__`, tag);
        });
        
        return html;
    }
    
    // HTML转义函数
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }
    
    // 格式化MES数据输出
    formatMesData(data) {
        console.log('[formatMesData] Input:', data);
        console.log('[formatMesData] Input type:', typeof data);
        
        // 如果是字符串，尝试解析JSON
        if (typeof data === 'string') {
            try {
                // 检查是否是JSON格式
                if (data.trim().startsWith('{') && data.trim().endsWith('}')) {
                    const parsed = JSON.parse(data);
                    console.log('[formatMesData] Parsed JSON:', parsed);
                    return this.formatMesData(parsed);
                }
                // 否则直接处理字符串
                const cleaned = this.cleanUpText(data);
                console.log('[formatMesData] Cleaned text:', cleaned);
                return cleaned;
            } catch (e) {
                // 不是有效的JSON，按普通字符串处理
                console.log('[formatMesData] Parse error, treating as plain text');
                const cleaned = this.cleanUpText(data);
                console.log('[formatMesData] Cleaned text:', cleaned);
                return cleaned;
            }
        }
        
        // 如果是对象，提取所有非空内容
        if (typeof data === 'object' && data !== null) {
            let contentParts = [];
            
            for (const [key, value] of Object.entries(data)) {
                if (value === null || value === undefined || value === '') {
                    continue; // 跳过空值
                }
                
                let cleanValue = '';
                if (typeof value === 'string') {
                    cleanValue = this.cleanUpText(value);
                } else {
                    cleanValue = String(value);
                }
                
                // 跳过空的处理结果
                if (cleanValue.trim() === '') continue;
                
                // 直接添加内容，不显示字段名
                contentParts.push(cleanValue);
            }
            
            // 用双换行连接多个内容部分
            return contentParts.length > 0 ? contentParts.join('\n\n') : '暂无数据';
        }
        
        return String(data);
    }
    
    // 清理文本格式
    cleanUpText(text) {
        if (!text) return '';
        
        console.log('[cleanUpText] Input:', text);
        
        const result = text
            .replace(/^[\n\s]+|[\n\s]+$/g, '') // 去除首尾空白
            .replace(/\\n/g, '\n') // 处理转义的换行符
            .replace(/\n{3,}/g, '\n\n') // 合并多个连续换行
            // 修正正则：只匹配真正的异常节点ID（换行符后跟13位以上的纯数字，然后是.text）
            .replace(/\n\d{13,}\.text\s*$/g, '') // 去除末尾的异常节点ID（如 \n1769587035275.text）
            .trim();
        
        console.log('[cleanUpText] Output:', result);
        return result;
    }
    
    autoResize() {
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = this.messageInput.scrollHeight + 'px';
    }
    
    async handleSubmit(e) {
        e.preventDefault();
        // 如果正在流式传输，阻止提交
        if (this.isStreaming) {
            console.log('Already streaming, ignoring submit');
            return;
        }
        
        const message = this.messageInput.value.trim();
        if (!message) return;
        
        this.updateSendButton(true);
        
        // Add user message to chat
        this.addMessage(message, 'user');
        
        // Clear input
        this.messageInput.value = '';
        this.autoResize();
        
        // Disable input while processing
        this.setInputState(false);
        
        // Show typing indicator
        const typingId = this.showTypingIndicator();
        
        try {
            // Send message with streaming
            await this.sendMessageStream(message);
        } catch (error) {
            console.error('Error:', error);
            this.removeMessage(typingId);
            this.addMessage('抱歉，发生了错误。请稍后重试。', 'bot');
        } finally {
            this.setInputState(true);
            this.messageInput.focus();
        }
    }
    
    async sendMessageStream(query) {
        console.log('=== SEND MESSAGE STREAM ===');
        console.log('Query:', query);
        console.log('Conversation ID:', this.conversationId);
        
        this.isStreaming = true;
        this.userStopped = false; // 重置停止标记
        this.abortController = new AbortController();
        const typingId = document.querySelector('.typing-indicator')?.parentElement?.id;
        let messageCreated = false;
        let messageDiv = null;
        let contentDiv = null;
        
        try {
            console.log('=== MAKING FETCH REQUEST ===');
            console.log('URL: /api/v1/chat/stream');
            const requestBody = {
                query: query,
                user: this.userId,
                conversation_id: this.conversationId,
                inputs: {}
            };
            console.log('Request body:', requestBody);
            
            const response = await fetch('/api/v1/chat/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    conversation_id: this.conversationId,
                    user: this.userId,
                    inputs: {}
                }),
                signal: this.abortController.signal
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            let fullAnswer = '';
            
            // Read streaming response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6).trim();
                        console.log('[RAW DATA LINE]', data);
                        if (data) {
                            try {
                                const json = JSON.parse(data);
                                console.log('=== Received event:', json.event, '===');
                                console.log('[FULL JSON]', JSON.stringify(json, null, 2));
                                
                                // Handle chat message events
                                if (json.event === 'message') {
                                    console.log('[MESSAGE EVENT] Processing...');
                                    // Get the answer from message data
                                    const answer = json.answer || '';
                                    console.log('[MESSAGE EVENT] Raw answer TYPE:', typeof answer);
                                    console.log('[MESSAGE EVENT] Raw answer LENGTH:', answer.length);
                                    console.log('[MESSAGE EVENT] Raw answer VALUE:', answer);
                                    console.log('[MESSAGE EVENT] Raw answer CHAR CODES:', Array.from(answer).map((c, i) => `${i}:${c}(${c.charCodeAt(0)})`).join(' '));
                                    
                                    // Only process if answer is not empty (ignore empty message events from workflow apps)
                                    if (answer) {
                                        // Full message event - contains complete answer
                                        if (!messageCreated) {
                                            if (typingId) {
                                                this.removeMessage(typingId);
                                            }
                                            const messageId = 'msg_' + Date.now();
                                            messageDiv = this.createMessageElement('', 'bot', messageId);
                                            this.chatMessages.appendChild(messageDiv);
                                            contentDiv = messageDiv.querySelector('.message-content p');
                                            messageCreated = true;
                                            console.log('[MESSAGE EVENT] Created message element');
                                        }
                                        
                                        if (contentDiv) {
                                            // 累加答案内容（流式传输）
                                            fullAnswer += answer;
                                            console.log('[MESSAGE EVENT] Accumulated answer length:', fullAnswer.length);
                                            
                                            // 格式化累加后的完整答案
                                            const formattedAnswer = this.formatMesData(fullAnswer);
                                            
                                            // 使用 Markdown 渲染
                                            const markdownContainer = contentDiv.querySelector('.markdown-body p') || contentDiv.querySelector('p');
                                            if (markdownContainer) {
                                                markdownContainer.innerHTML = this.markdownToHtml(formattedAnswer);
                                            } else {
                                                contentDiv.innerHTML = `<div class="markdown-body"><p>${this.markdownToHtml(formattedAnswer)}</p></div>`;
                                            }
                                            this.scrollToBottom();
                                        }
                                    } else {
                                        console.log('[MESSAGE EVENT] Answer is empty - skipping (workflow app sends answer in workflow_finished)');
                                    }
                                } else if (json.event === 'workflow_finished') {
                                    // Ignore workflow_finished - only use message event for Chat Message API
                                    console.log('[WORKFLOW_FINISHED EVENT] Ignoring - only processing message events');
                                } else if (json.event === 'message_end') {
                                    // End of message - save conversation_id
                                    if (json.conversation_id) {
                                        this.conversationId = json.conversation_id;
                                        console.log('Updated conversation_id:', this.conversationId);
                                    }
                                } else if (json.event === 'agent_message' || json.event === 'text_chunk') {
                                    console.log('[AGENT_MESSAGE/TEXT_CHUNK EVENT] Processing...');
                                    // Streaming text chunks - accumulate content
                                    if (!messageCreated) {
                                        if (typingId) {
                                            this.removeMessage(typingId);
                                        }
                                        const messageId = 'msg_' + Date.now();
                                        messageDiv = this.createMessageElement('', 'bot', messageId);
                                        this.chatMessages.appendChild(messageDiv);
                                        contentDiv = messageDiv.querySelector('.message-content p');
                                        messageCreated = true;
                                        console.log('[AGENT_MESSAGE/TEXT_CHUNK EVENT] Created message element');
                                    }
                                    
                                    // Append streaming text if available
                                    if (json.data && contentDiv) {
                                        const chunkText = json.data.text || json.data.answer || json.data;
                                        if (typeof chunkText === 'string') {
                                            fullAnswer += chunkText;
                                            
                                            // Update display with accumulated content
                                            const formattedAnswer = this.formatMesData(fullAnswer);
                                            const markdownContainer = contentDiv.querySelector('.markdown-body p') || contentDiv.querySelector('p');
                                            if (markdownContainer) {
                                                markdownContainer.innerHTML = this.markdownToHtml(formattedAnswer);
                                            } else {
                                                contentDiv.innerHTML = `<div class="markdown-body"><p>${this.markdownToHtml(formattedAnswer)}</p></div>`;
                                            }
                                            this.scrollToBottom();
                                        }
                                    }
                                } else if (json.event === 'workflow_finished') {
                                    // 忽略 workflow_finished 事件，因为使用的是 Chat Message API
                                    // message 事件已经包含了完整答案
                                    console.log('[WORKFLOW_FINISHED EVENT] Ignored - using message event instead');
                                } else if (json.event === 'node_finished') {
                                    // 忽略 node_finished 事件
                                    console.log('[NODE_FINISHED EVENT] Ignored');
                                } else if (json.event === 'workflow_started' || json.event === 'node_started') {
                                    // 忽略 workflow/node started 事件
                                    console.log('[' + json.event.toUpperCase() + ' EVENT] Ignored');
                                } else if (json.error) {
                                    // Error event
                                    throw new Error(json.error);
                                } else {
                                    // Unknown event, log it
                                    console.log('Unknown event:', json.event, json);
                                }
                            } catch (e) {
                                console.warn('Failed to parse JSON:', data, e);
                            }
                        }
                    }
                }
            }
            
            // Remove typing indicator if still present
            const remainingTyping = document.querySelector('.typing-indicator');
            if (remainingTyping) {
                const typingMessage = remainingTyping.closest('.message');
                if (typingMessage) {
                    typingMessage.remove();
                }
            }
            
            // If no content received, show error
            console.log('[LOOP END] Checking fullAnswer:', fullAnswer ? 'HAS CONTENT' : 'EMPTY');
            console.log('[LOOP END] messageCreated:', messageCreated);
            if (!fullAnswer) {
                console.log('[LOOP END] No content received, creating error message');
                if (!messageCreated) {
                    const messageId = 'msg_' + Date.now();
                    messageDiv = this.createMessageElement('', 'bot', messageId);
                    this.chatMessages.appendChild(messageDiv);
                    contentDiv = messageDiv.querySelector('.message-content p');
                    console.log('[LOOP END] Created error message element');
                }
                if (contentDiv) {
                    contentDiv.textContent = '抱歉，没有收到响应。';
                }
            } else {
                console.log('[LOOP END] Content received, no error message needed');
                
                // 添加免责声明到最新的机器人消息
                this.addDisclaimerToLatestBotMessage();
            }
            
        } catch (error) {
            // 如果是用户主动中断，显示停止消息
            if (error.name === 'AbortError') {
                console.log('Request aborted by user');
                // Remove typing indicator if present
                const typingElement = document.querySelector('.typing-indicator');
                if (typingElement) {
                    const typingMessage = typingElement.closest('.message');
                    if (typingMessage) {
                        typingMessage.remove();
                    }
                }
                
                // 显示停止消息
                if (this.userStopped) {
                    const messageId = 'msg_' + Date.now();
                    const stopMessage = this.createMessageElement(
                        '用户停止了回复信息',
                        'bot',
                        messageId
                    );
                    this.chatMessages.appendChild(stopMessage);
                    this.scrollToBottom();
                    this.addDisclaimerToLatestBotMessage();
                }
            } else {
                console.error('Stream error:', error);
                
                // Remove typing indicator if present
                const typingElement = document.querySelector('.typing-indicator');
                if (typingElement) {
                    const typingMessage = typingElement.closest('.message');
                    if (typingMessage) {
                        typingMessage.remove();
                    }
                }
                
                // Show error message
                if (!messageCreated) {
                    const messageId = 'msg_' + Date.now();
                    messageDiv = this.createMessageElement('', 'bot', messageId);
                    this.chatMessages.appendChild(messageDiv);
                    contentDiv = messageDiv.querySelector('.message-content p');
                }
                if (contentDiv) {
                    contentDiv.textContent = `抱歉，发生了错误：${error.message}`;
                }
                this.addDisclaimerToLatestBotMessage();
            }
        } finally {
            this.isStreaming = false;
            this.abortController = null;
            this.updateSendButton(false);
        }
    }
    
    addMessage(content, type) {
        // 如果是机器人消息，先移除所有之前的免责声明
        if (type === 'bot') {
            const oldDisclaimers = this.chatMessages.querySelectorAll('.message-disclaimer');
            oldDisclaimers.forEach(disclaimer => disclaimer.remove());
        }
        
        const messageId = 'msg_' + Date.now();
        const messageDiv = this.createMessageElement(content, type, messageId);
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
        return messageId;
    }
    
    createMessageElement(content, type, id) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;
        messageDiv.id = id;
        
        const avatar = document.createElement('div');
        avatar.className = `message-avatar ${type}-avatar`;
        avatar.textContent = type === 'bot' ? '小易' : '';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // 使用 markdown-body 作为内容容器
        const markdownBody = document.createElement('div');
        markdownBody.className = 'markdown-body';
        
        const p = document.createElement('p');
        if (content) {
            if (type === 'bot') {
                // Bot消息使用markdown渲染
                p.innerHTML = this.markdownToHtml(content);
            } else {
                // 用户消息保持纯文本
                p.textContent = content;
            }
        }
        
        markdownBody.appendChild(p);
        contentDiv.appendChild(markdownBody);
        
        // 为机器人消息添加免责声明
        if (type === 'bot') {
            const disclaimer = document.createElement('div');
            disclaimer.className = 'message-disclaimer';
            disclaimer.style.cssText = 'color: #6c757d; font-size: 12px; margin-top: 8px; text-align: right; font-style: italic;';
            disclaimer.textContent = '- 数据仅供参考，需认真核对再使用 -';
            contentDiv.appendChild(disclaimer);
        }
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);
        
        return messageDiv;
    }
    
    showTypingIndicator() {
        const typingId = 'typing_' + Date.now();
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot-message';
        messageDiv.id = typingId;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar bot-avatar';
        avatar.textContent = '小易';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing-indicator';
        const letters = 'EasyMES';
        for (let i = 0; i < letters.length; i++) {
            const letter = document.createElement('span');
            letter.className = 'typing-letter';
            letter.textContent = letters[i];
            typingDiv.appendChild(letter);
        }
        
        contentDiv.appendChild(typingDiv);
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);
        
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
        
        return typingId;
    }
    
    removeMessage(messageId) {
        const message = document.getElementById(messageId);
        if (message) {
            message.remove();
        }
    }
    
    clearChat() {
        this.chatMessages.innerHTML = '';
        this.conversationId = null;
        console.log('Chat cleared');
    }
    
    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }
    
    addDisclaimerToLatestBotMessage() {
        // 先移除所有现有的免责声明
        const oldDisclaimers = this.chatMessages.querySelectorAll('.message-disclaimer');
        oldDisclaimers.forEach(disclaimer => disclaimer.remove());
        
        // 找到最后一条机器人消息
        const botMessages = this.chatMessages.querySelectorAll('.bot-message');
        if (botMessages.length > 0) {
            const latestBotMessage = botMessages[botMessages.length - 1];
            const contentDiv = latestBotMessage.querySelector('.message-content');
            
            if (contentDiv && !contentDiv.querySelector('.message-disclaimer')) {
                const disclaimer = document.createElement('div');
                disclaimer.className = 'message-disclaimer';
                disclaimer.style.cssText = 'color: #6c757d; font-size: 12px; margin-top: 8px; text-align: right; font-style: italic;';
                disclaimer.textContent = '- 数据仅供参考，需认真核对再使用 -';
                contentDiv.appendChild(disclaimer);
            }
        }
    }
    
    setInputState(enabled) {
        this.messageInput.disabled = !enabled;
        // 不禁用发送按钮，因为它需要作为停止按钮使用
        // this.sendBtn.disabled = !enabled;
    }
}

// Initialize chatbot when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ChatBot();
});
