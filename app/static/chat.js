// Chatbot JavaScript
class ChatBot {
    constructor() {
        this.conversationId = null;
        this.userId = this.generateUserId();
        this.isStreaming = false;
        
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
        this.clearBtn.addEventListener('click', () => this.clearChat());
        
        // Auto-resize textarea
        this.messageInput.addEventListener('input', () => this.autoResize());
        
        // Enter to send, Shift+Enter for new line
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.chatForm.dispatchEvent(new Event('submit'));
            }
        });
        
        console.log('ChatBot initialized');
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
    
    // 将 Markdown 表格转换为 HTML
    markdownToHtml(markdown) {
        let html = markdown;
        
        // 保留 HTML 标签（如 details, summary）
        const htmlTags = /<(details|summary|\/details|\/summary)>/g;
        const preservedTags = [];
        html = html.replace(htmlTags, (match) => {
            preservedTags.push(match);
            return `__HTML_TAG_${preservedTags.length - 1}__`;
        });
        
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
        
        // 转换粗体文本 **text**
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        
        // 转换列表项 - text
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
        if (html.includes('<li>')) {
            html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);
        }
        
        // 转换换行符
        html = html.replace(/\n/g, '<br>');
        
        // 恢复 HTML 标签
        preservedTags.forEach((tag, index) => {
            html = html.replace(`__HTML_TAG_${index}__`, tag);
        });
        
        return html;
    }
    
    autoResize() {
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = this.messageInput.scrollHeight + 'px';
    }
    
    async handleSubmit(e) {
        e.preventDefault();
        
        const message = this.messageInput.value.trim();
        if (!message || this.isStreaming) return;
        
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
        this.isStreaming = true;
        const typingId = document.querySelector('.typing-indicator')?.parentElement?.id;
        let messageCreated = false;
        let messageDiv = null;
        let contentDiv = null;
        
        try {
            const response = await fetch('/easymes/api/v1/chat/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    conversation_id: this.conversationId,
                    user: this.userId,
                    inputs: {}
                })
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
                        if (data) {
                            try {
                                const json = JSON.parse(data);
                                console.log('Received data:', json);
                                
                                // Handle workflow events
                                if (json.event === 'workflow_started') {
                                    console.log('Workflow started');
                                    // Keep typing indicator visible
                                } else if (json.event === 'workflow_finished') {
                                    // Remove typing indicator and create message on first data
                                    if (!messageCreated) {
                                        if (typingId) {
                                            this.removeMessage(typingId);
                                        }
                                        const messageId = 'msg_' + Date.now();
                                        messageDiv = this.createMessageElement('', 'bot', messageId);
                                        this.chatMessages.appendChild(messageDiv);
                                        contentDiv = messageDiv.querySelector('.message-content p');
                                        messageCreated = true;
                                    }
                                    
                                    // Workflow finished, extract result
                                    if (json.data && json.data.outputs && contentDiv) {
                                        const outputs = json.data.outputs;
                                        // 后端已经格式化好了，直接使用
                                        fullAnswer = outputs.text || outputs.result || outputs.output || JSON.stringify(outputs);
                                        
                                        // 使用 Markdown 渲染
                                        contentDiv.innerHTML = this.markdownToHtml(String(fullAnswer));
                                        this.scrollToBottom();
                                    }
                                } else if (json.event === 'node_finished') {
                                    // Remove typing indicator and create message on first data
                                    if (!messageCreated) {
                                        if (typingId) {
                                            this.removeMessage(typingId);
                                        }
                                        const messageId = 'msg_' + Date.now();
                                        messageDiv = this.createMessageElement('', 'bot', messageId);
                                        this.chatMessages.appendChild(messageDiv);
                                        contentDiv = messageDiv.querySelector('.message-content p');
                                        messageCreated = true;
                                    }
                                    
                                    // Node finished, might contain intermediate results
                                    if (json.data && json.data.outputs && contentDiv) {
                                        const outputs = json.data.outputs;
                                        const result = outputs.text || outputs.result || outputs.output;
                                        if (result) {
                                            fullAnswer = result;
                                            contentDiv.textContent = fullAnswer;
                                            this.scrollToBottom();
                                        }
                                    }
                                } else if (json.event === 'text_chunk' || json.event === 'agent_message' || json.event === 'message') {
                                    // Remove typing indicator and create message on first data
                                    if (!messageCreated) {
                                        if (typingId) {
                                            this.removeMessage(typingId);
                                        }
                                        const messageId = 'msg_' + Date.now();
                                        messageDiv = this.createMessageElement('', 'bot', messageId);
                                        this.chatMessages.appendChild(messageDiv);
                                        contentDiv = messageDiv.querySelector('.message-content p');
                                        messageCreated = true;
                                    }
                                    
                                    // Streaming text chunks
                                    if (contentDiv) {
                                        if (json.answer) {
                                            fullAnswer = json.answer;
                                            contentDiv.textContent = fullAnswer;
                                            this.scrollToBottom();
                                        } else if (json.data) {
                                            fullAnswer += json.data;
                                            contentDiv.textContent = fullAnswer;
                                            this.scrollToBottom();
                                        }
                                    }
                                } else if (json.event === 'message_end') {
                                    // Save conversation ID
                                    if (json.conversation_id) {
                                        this.conversationId = json.conversation_id;
                                    }
                                } else if (json.error) {
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
            if (!fullAnswer) {
                if (!messageCreated) {
                    const messageId = 'msg_' + Date.now();
                    messageDiv = this.createMessageElement('', 'bot', messageId);
                    this.chatMessages.appendChild(messageDiv);
                    contentDiv = messageDiv.querySelector('.message-content p');
                }
                if (contentDiv) {
                    contentDiv.textContent = '抱歉，没有收到响应。';
                }
            }
            
        } finally {
            this.isStreaming = false;
        }
    }
    
    addMessage(content, type) {
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
        avatar.textContent = type === 'bot' ? '小易' : '我';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        const p = document.createElement('p');
        p.textContent = content;
        contentDiv.appendChild(p);
        
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
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.className = 'typing-dot';
            typingDiv.appendChild(dot);
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
    
    setInputState(enabled) {
        this.messageInput.disabled = !enabled;
        this.sendBtn.disabled = !enabled;
    }
}

// Initialize chatbot when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ChatBot();
});
