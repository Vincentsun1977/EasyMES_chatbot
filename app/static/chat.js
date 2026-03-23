// Chatbot JavaScript
console.log('=== Chat.js loaded successfully ===');
console.log('Current timestamp:', new Date().toISOString());

class ChatBot {
    constructor() {
        this.sectionHeadingWhitelist = [
            '总体概览',
            '关键指标',
            '异常提示',
            '建议操作',
            '具体明细'
        ];
        this.conversationId = null;
        this.userId = this.generateUserId();
        this.isStreaming = false;
        this.showAvatarUrlInBotReply = false; // 临时调试开关：在机器人回复中显示 avatar URL
        this.avatarUpstreamUrlDebug = null;
        this.isWorkflowApp = false; // 标记是否为 workflow 应用
        this.abortController = null; // 用于中断请求
        this.chartInstances = new Map();
        this.chartModal = null;
        
        // DOM elements
        this.chatMessages = document.getElementById('chatMessages');
        this.chatForm = document.getElementById('chatForm');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.clearBtn = document.getElementById('clearBtn');
        
        // Sidebar elements
        this.menuBtn = document.getElementById('menuBtn');
        this.sidebar = document.getElementById('sidebar');
        this.sidebarOverlay = document.getElementById('sidebarOverlay');
        this.closeSidebar = document.getElementById('closeSidebar');
        this.multiSelectBtn = document.getElementById('multiSelectBtn');
        this.bulkActionsBar = document.getElementById('conversationBulkActions');
        this.bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
        this.cancelMultiSelectBtn = document.getElementById('cancelMultiSelectBtn');
        this.selectedCountText = document.getElementById('selectedCountText');
        this.conversationList = document.getElementById('conversationList');
        this.activeConversationMenu = null;
        this.isMultiSelectMode = false;
        this.selectedConversationIds = new Set();
        
        this.init();
    }
    
    init() {
        // Event listeners
        if (!this.chatForm || !this.sendBtn || !this.messageInput) {
            console.error('[Init] Critical chat elements missing');
            return;
        }
        this.chatForm.addEventListener('submit', (e) => this.handleSubmit(e));
        // 使用 click 事件，按钮类型改为 button 避免自动提交
        this.sendBtn.addEventListener('click', (e) => this.handleSendButtonClick(e));
        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', () => this.clearChat());
        }
        
        // Sidebar event listeners
        this.menuBtn.addEventListener('click', () => this.openSidebar());
        this.closeSidebar.addEventListener('click', () => this.closeSidebarPanel());
        this.sidebarOverlay.addEventListener('click', () => this.closeSidebarPanel());
        if (this.multiSelectBtn) {
            this.multiSelectBtn.addEventListener('click', () => this.toggleMultiSelectMode());
        }
        if (this.bulkDeleteBtn) {
            this.bulkDeleteBtn.addEventListener('click', () => this.handleBulkDeleteConversations());
        }
        if (this.cancelMultiSelectBtn) {
            this.cancelMultiSelectBtn.addEventListener('click', () => this.toggleMultiSelectMode(false));
        }
        document.addEventListener('click', () => this.closeAllConversationMenus());
        
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

        // 调试：仅在开关打开时，获取后端最终头像 URL（从响应头读取）
        if (this.showAvatarUrlInBotReply) {
            this.resolveAvatarUpstreamUrlDebug();
        }
        
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
        [this.sendBtn, this.clearBtn].filter(Boolean).forEach(btn => {
            btn.addEventListener('touchstart', () => {
                btn.style.opacity = '0.7';
            });
            btn.addEventListener('touchend', () => {
                btn.style.opacity = '1';
            });
        });
    }
    
    async handleSendButtonClick(e) {
        try {
            e.preventDefault();
            e.stopPropagation();

            if (this.isStreaming) {
                // 正在流式传输，点击停止
                console.log('Stopping stream...');
                this.stopStreaming();
            } else {
                console.log('Button clicked, triggering form submit...');
                if (this.chatForm && typeof this.chatForm.requestSubmit === 'function') {
                    this.chatForm.requestSubmit();
                } else if (this.chatForm) {
                    this.chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                }
            }
        } catch (error) {
            console.error('[SendButton] Click handler error:', error);
        }
    }

    async sendCurrentMessage() {
        const message = (this.messageInput?.value || '').trim();
        if (!message) {
            return;
        }

        await this.submitMessage(message, true);
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
        if (!svg) {
            console.warn('[SendButton] SVG icon not found, skip icon update');
            return;
        }
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
        const params = new URLSearchParams(window.location.search);
        const employeeId = params.get('EmployeeId') || params.get('employee_id');
        const globalEmployeeId = window.employee_id || window.employeeId;
        return employeeId || globalEmployeeId || 'CNHUSUN';
    }

    getUserAvatarUrl() {
        const employeeId = this.userId || 'CNHUSUN';
        const encodedEmployeeId = encodeURIComponent(employeeId);
        return `/api/v1/avatar?EmployeeId=${encodedEmployeeId}&avatarKey=${encodedEmployeeId}`;
    }

    appendAvatarUrlDebug(content) {
        const baseContent = String(content || '');
        if (!this.showAvatarUrlInBotReply) {
            return baseContent;
        }
        const proxyUrl = this.getUserAvatarUrl();
        const upstreamUrl = this.avatarUpstreamUrlDebug || '(loading...)';
        return `${baseContent}\n\n[DEBUG avatar_proxy_url] ${proxyUrl}\n[DEBUG avatar_upstream_url] ${upstreamUrl}`;
    }

    async resolveAvatarUpstreamUrlDebug() {
        if (!this.showAvatarUrlInBotReply) {
            return;
        }

        const proxyUrl = this.getUserAvatarUrl();
        try {
            const resp = await fetch(proxyUrl, {
                method: 'GET',
                cache: 'no-store',
            });
            const upstreamUrl = resp.headers.get('x-avatar-upstream-url');
            if (upstreamUrl) {
                this.avatarUpstreamUrlDebug = upstreamUrl;
            } else {
                this.avatarUpstreamUrlDebug = '(header missing)';
            }
        } catch (error) {
            console.warn('[AvatarDebug] Failed to resolve upstream URL:', error);
            this.avatarUpstreamUrlDebug = `(resolve failed: ${error?.message || 'unknown'})`;
        }
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
            return `<div class="mes-table-wrapper">${table}</div>`;
        });
        
        // 转换标题 ## text
        html = html.replace(/^### (.+)$/gm, '<h3 class="markdown-h3">$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2 class="markdown-h2">$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1 class="markdown-h1">$1</h1>');
        
        // 转换粗体文本 **text**
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        
        // 转换斜体文本 *text*
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // 自动识别并转换链接（http/https）
        html = this.linkifyUrls(html);
        
        // 转换有序列表 1. text (必须是行首，且点后有空格)
        // 先去掉列表项之间的空行，避免空行被转成 <br> 残留
        html = html.replace(/\n\n(- )/g, '\n$1');
        html = html.replace(/\n\n(\d+\. )/g, '\n$1');
        html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<li class="ordered">$2</li>');
        if (html.includes('<li class="ordered">')) {
            html = html.replace(/(<li class="ordered">.*<\/li>\n?)+/g, (match) => `<ol>${match.replace(/ class="ordered"/g, '')}</ol>`);
        }
        
        // 转换无序列表，支持缩进的子列表
        html = this.renderUnorderedLists(html);
        
        // 转换换行符
        html = html.replace(/\n/g, '<br>');
        
        // 清理多余的 <br>：块级元素前后的 <br> 去掉，多个连续 <br> 合并为一个
        const blockTags = 'ul|ol|li|h1|h2|h3|blockquote|pre|div|table|tr|thead|tbody';
        html = html.replace(new RegExp(`(<br>)+(<\/?(?:${blockTags})[^>]*>)`, 'g'), '$2');
        html = html.replace(new RegExp(`(<\/?(?:${blockTags})[^>]*>)(<br>)+`, 'g'), '$1');
        html = html.replace(/(<br>){2,}/g, '<br>');
        
        // 恢复 HTML 标签
        preservedTags.forEach((tag, index) => {
            html = html.replace(`__HTML_TAG_${index}__`, tag);
        });

        // 对回复中的关键数字加粗
        html = this.emphasizeKeyNumbersInHtml(html);
        html = this.enhanceReplySections(html);
        
        return html;
    }

    linkifyUrls(text) {
        const urlRegex = /(https?:\/\/[^\s<]+)/g;
        return text.replace(urlRegex, (url) => {
            let cleanUrl = url;
            let trailing = '';
            const trailingMatch = cleanUrl.match(/[.,!?;:)]$/);
            if (trailingMatch) {
                trailing = trailingMatch[0];
                cleanUrl = cleanUrl.slice(0, -1);
            }

            return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${trailing}`;
        });
    }

    shouldEmphasizeNumericToken(token) {
        if (!token) {
            return false;
        }

        const cleanToken = String(token).trim();
        if (!cleanToken) {
            return false;
        }

        if (cleanToken.includes('%') || cleanToken.includes('.') || cleanToken.includes(',')) {
            return true;
        }

        const digits = cleanToken.replace(/[^\d-]/g, '').replace('-', '');
        return digits.length >= 2;
    }

    emphasizeKeyNumbersInHtml(html) {
        const parts = String(html || '').split(/(<[^>]+>)/g);
        const numberRegex = /(-?\d{1,3}(?:,\d{3})*(?:\.\d+)?%?)/g;

        return parts
            .map((part) => {
                if (!part || part.startsWith('<')) {
                    return part;
                }

                return part.replace(numberRegex, (match) => {
                    if (!this.shouldEmphasizeNumericToken(match)) {
                        return match;
                    }

                    return `<strong class="key-number">${match}</strong>`;
                });
            })
            .join('');
    }

    renderUnorderedLists(text) {
        const lines = String(text || '').split('\n');
        const result = [];
        const indentStack = [];
        const openLiStack = [];

        const closeListItemAtLevel = (level) => {
            if (openLiStack[level]) {
                result.push('</li>');
                openLiStack[level] = false;
            }
        };

        const closeListsUntilIndent = (indent) => {
            while (indentStack.length && indentStack[indentStack.length - 1] > indent) {
                const level = indentStack.length - 1;
                closeListItemAtLevel(level);
                result.push('</ul>');
                indentStack.pop();
                openLiStack.pop();
            }
        };

        lines.forEach((line) => {
            const match = line.match(/^(\s*)-\s+(.+)$/);
            if (!match) {
                closeListsUntilIndent(-1);
                if (line) {
                    result.push(line);
                }
                return;
            }

            const indent = match[1].replace(/\t/g, '    ').length;
            const content = match[2].trim();
            if (!content) {
                return;
            }

            closeListsUntilIndent(indent);

            if (!indentStack.length || indent > indentStack[indentStack.length - 1]) {
                result.push('<ul>');
                indentStack.push(indent);
                openLiStack.push(false);
            } else {
                closeListItemAtLevel(indentStack.length - 1);
            }

            result.push(`<li>${content}`);
            openLiStack[indentStack.length - 1] = true;
        });

        closeListsUntilIndent(-1);
        return result.join('\n');
    }

    enhanceReplySections(html) {
        if (!html || (!html.includes('<ul>') && !html.includes('<ol>'))) {
            return html;
        }

        const root = document.createElement('div');
        root.innerHTML = html;

        this.promoteInlineTextToSectionHeading(root);
        this.wrapReplySections(root);
        this.updateSectionDividerState(root);

        return root.innerHTML;
    }

    promoteInlineTextToSectionHeading(root) {
        const fragment = document.createDocumentFragment();
        let pendingNodes = [];

        const flushPendingNodes = () => {
            pendingNodes.forEach((node) => fragment.appendChild(node));
            pendingNodes = [];
        };

        Array.from(root.childNodes).forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE || (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR')) {
                pendingNodes.push(node);
                return;
            }

            if (node.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test(node.tagName)) {
                const headingText = this.extractSectionHeadingText(pendingNodes);
                if (headingText) {
                    pendingNodes = [];
                    const heading = document.createElement('h3');
                    heading.className = 'markdown-h3 markdown-section-heading markdown-auto-heading';
                    heading.textContent = this.formatSectionHeadingText(headingText);
                    fragment.appendChild(heading);
                    fragment.appendChild(node);
                    return;
                }
            }

            flushPendingNodes();
            fragment.appendChild(node);
        });

        flushPendingNodes();
        root.innerHTML = '';
        root.appendChild(fragment);
    }

    extractSectionHeadingText(nodes) {
        if (!nodes || !nodes.length) {
            return null;
        }

        const lines = [];
        let currentLine = '';

        nodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                currentLine += node.textContent || '';
                return;
            }

            if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
                lines.push(currentLine.trim());
                currentLine = '';
            }
        });

        lines.push(currentLine.trim());

        const meaningfulLines = lines
            .map((line) => line.replace(/\s+/g, ' ').trim())
            .filter(Boolean);

        if (!meaningfulLines.length || meaningfulLines.length > 2) {
            return null;
        }

        if (meaningfulLines.length === 2 && !this.isLikelyHeadingLeadIn(meaningfulLines[0])) {
            return null;
        }

        const candidate = meaningfulLines[meaningfulLines.length - 1];
        if (!candidate || candidate.length > 48) {
            return null;
        }

        if (/[。！？!?]$/.test(candidate) && !/[：:]$/.test(candidate)) {
            return null;
        }

        if (!this.isWhitelistedSectionHeading(candidate)) {
            return null;
        }

        return candidate.replace(/[：:]\s*$/, '').trim() || null;
    }

    isWhitelistedSectionHeading(text) {
        const normalized = String(text || '')
            .replace(/[：:]/g, '')
            .replace(/[()（）\[\]【】]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (!normalized) {
            return false;
        }

        return this.sectionHeadingWhitelist.some((keyword) => normalized.includes(keyword));
    }

    isLikelyHeadingLeadIn(text) {
        const normalized = String(text || '').trim();
        if (!normalized) {
            return false;
        }

        if (normalized.length > 24) {
            return false;
        }

        return /[：:]$/.test(normalized);
    }

    formatSectionHeadingText(text) {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .replace(/(?<=[\u4e00-\u9fff]) (?=[\u4e00-\u9fff(（\dA-Za-z])/g, '\u00A0')
            .replace(/(?<=[(（\dA-Za-z]) (?=[\u4e00-\u9fff])/g, '\u00A0')
            .trim();
    }

    wrapReplySections(root) {
        const fragment = document.createDocumentFragment();
        const children = Array.from(root.childNodes);

        for (let index = 0; index < children.length; index += 1) {
            const node = children[index];

            if (this.isReplyHeadingElement(node)) {
                const listIndex = this.findNextListIndex(children, index + 1);
                if (listIndex !== -1) {
                    const section = document.createElement('div');
                    section.className = 'markdown-section';
                    section.appendChild(node);
                    section.appendChild(children[listIndex]);
                    fragment.appendChild(section);
                    index = listIndex;
                    continue;
                }
            }

            if (this.isReplyListElement(node)) {
                const section = document.createElement('div');
                section.className = 'markdown-section markdown-section-list-only';
                section.appendChild(node);
                fragment.appendChild(section);
                continue;
            }

            if (this.isIgnorableSpacingNode(node)) {
                continue;
            }

            fragment.appendChild(node);
        }

        root.innerHTML = '';
        root.appendChild(fragment);
    }

    updateSectionDividerState(root) {
        const sections = Array.from(root.children).filter((node) =>
            node.nodeType === Node.ELEMENT_NODE && node.classList.contains('markdown-section')
        );

        sections.forEach((section, index) => {
            section.classList.remove('markdown-section-has-divider');

            if (!section.classList.contains('markdown-section-list-only')) {
                return;
            }

            const hasFollowingContent = sections.slice(index + 1).some((nextSection) => {
                return this.hasMeaningfulSectionContent(nextSection);
            });

            if (hasFollowingContent) {
                section.classList.add('markdown-section-has-divider');
            }
        });
    }

    hasMeaningfulSectionContent(section) {
        if (!section) {
            return false;
        }

        const text = (section.textContent || '').replace(/\s+/g, '').trim();
        return Boolean(text);
    }

    isReplyHeadingElement(node) {
        return !!(node && node.nodeType === Node.ELEMENT_NODE && /^(H1|H2|H3)$/.test(node.tagName));
    }

    isReplyListElement(node) {
        return !!(node && node.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test(node.tagName));
    }

    isIgnorableSpacingNode(node) {
        if (!node) {
            return true;
        }

        if (node.nodeType === Node.TEXT_NODE) {
            return !(node.textContent || '').trim();
        }

        return node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR';
    }

    findNextListIndex(children, startIndex) {
        for (let index = startIndex; index < children.length; index += 1) {
            const node = children[index];
            if (this.isReplyListElement(node)) {
                return index;
            }

            if (!this.isIgnorableSpacingNode(node)) {
                return -1;
            }
        }

        return -1;
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

    stripMarkdownSyntax(text) {
        return String(text || '')
            .replace(/<[^>]*>/g, '')
            .replace(/\*\*|__/g, '')
            .replace(/[*_`~]/g, '')
            .trim();
    }

    getNumericValueFromText(text) {
        const source = String(text || '').replace(/,/g, '').trim();
        const match = source.match(/-?\d+(?:\.\d+)?/);
        if (!match) {
            return null;
        }
        const value = Number(match[0]);
        return Number.isFinite(value) ? value : null;
    }

    isTimeLikeLabel(label) {
        const normalized = String(label || '').trim();
        return /(\d{4}[-\/.年]\d{1,2}|\d{1,2}[-\/.月]\d{1,2}|\d{1,2}月|Q[1-4]|第[一二三四]季|周|星期|周[一二三四五六日天]|\d{4}年|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(normalized);
    }

    extractPairsFromMarkdownTable(content) {
        const lines = String(content || '').split('\n').map(line => line.trim());
        const tableLines = lines.filter(line => line.startsWith('|') && line.endsWith('|'));
        if (tableLines.length < 3) {
            return [];
        }

        const dataRows = tableLines.slice(2);
        const result = [];

        for (const row of dataRows) {
            const cells = row.split('|').map(cell => this.stripMarkdownSyntax(cell)).filter(Boolean);
            if (cells.length < 2) {
                continue;
            }

            const label = cells[0];
            const rawValue = cells[1];
            const value = this.getNumericValueFromText(rawValue);
            if (!label || value === null) {
                continue;
            }

            result.push({ label, value, rawValue });
        }

        return result;
    }

    extractPairsFromLines(content) {
        const lines = String(content || '').split('\n').map(line => line.trim()).filter(Boolean);
        const result = [];
        const patterns = [
            /^[-*]\s*([^:：]{1,40})\s*[:：]\s*([-+]?\d[\d,.]*\s*%?)/,
            /^(?:\d+[.)、]\s*)?([^:：]{1,40})\s*[:：]\s*([-+]?\d[\d,.]*\s*%?)/,
            /^([^:：]{1,30})\s+([-+]?\d[\d,.]*\s*%?)$/
        ];

        for (const line of lines) {
            const plainLine = this.stripMarkdownSyntax(line);
            let matched = null;
            for (const pattern of patterns) {
                const match = plainLine.match(pattern);
                if (match) {
                    matched = match;
                    break;
                }
            }

            if (!matched) {
                continue;
            }

            const label = this.stripMarkdownSyntax(matched[1]);
            const rawValue = matched[2];
            const value = this.getNumericValueFromText(rawValue);
            if (!label || value === null) {
                continue;
            }

            result.push({ label, value, rawValue });
        }

        return result;
    }

    extractPairsFromStructuredRows(content) {
        const lines = String(content || '').split('\n').map(line => line.trim()).filter(Boolean);
        if (lines.length < 3) {
            return [];
        }

        const splitColumns = (line) => {
            if (line.includes('\t')) {
                return line.split(/\t+/).map(cell => this.stripMarkdownSyntax(cell)).filter(Boolean);
            }
            return line.split(/\s{2,}/).map(cell => this.stripMarkdownSyntax(cell)).filter(Boolean);
        };

        const headerCells = splitColumns(lines[0]);
        if (headerCells.length < 2) {
            return [];
        }

        const dataRows = lines.slice(1);
        const result = [];

        for (const row of dataRows) {
            const cells = splitColumns(row);
            if (cells.length < 2) {
                continue;
            }

            const rawValue = cells[cells.length - 1];
            const value = this.getNumericValueFromText(rawValue);
            if (value === null) {
                continue;
            }

            let label = '';
            if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
                label = cells[1];
            } else {
                label = cells[0];
            }

            label = this.stripMarkdownSyntax(label);
            if (!label) {
                continue;
            }

            result.push({ label, value, rawValue });
        }

        return result;
    }

    extractPairsFromRenderedTable(messageDiv) {
        if (!messageDiv) {
            return [];
        }

        const table = messageDiv.querySelector('.markdown-body table');
        if (!table) {
            return [];
        }

        const rows = table.querySelectorAll('tbody tr');
        if (!rows.length) {
            return [];
        }

        const result = [];
        rows.forEach((row) => {
            const cells = Array.from(row.querySelectorAll('td'))
                .map(td => this.stripMarkdownSyntax(td.textContent || ''))
                .filter(Boolean);

            if (cells.length < 2) {
                return;
            }

            const rawValue = cells[cells.length - 1];
            const value = this.getNumericValueFromText(rawValue);
            if (value === null) {
                return;
            }

            let label = '';
            if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
                label = cells[1];
            } else {
                label = cells[0];
            }

            label = this.stripMarkdownSyntax(label);
            if (!label) {
                return;
            }

            result.push({ label, value, rawValue });
        });

        return result;
    }

    isTotalLikeLabel(label) {
        const normalized = String(label || '')
            .toLowerCase()
            .replace(/[\s_\-:：]/g, '');
        return /(合计|总计|汇总|小计|total|sum|grandtotal)/i.test(normalized);
    }

    splitDisplayAndTotalPairs(pairs) {
        const sourcePairs = Array.isArray(pairs) ? pairs : [];
        const displayPairs = sourcePairs.filter(pair => !this.isTotalLikeLabel(pair.label));
        const totalPairs = sourcePairs.filter(pair => this.isTotalLikeLabel(pair.label));

        let percentBase = null;
        for (const pair of totalPairs) {
            const value = Number(pair.value);
            if (Number.isFinite(value) && value > 0) {
                percentBase = value;
                break;
            }
        }

        if (!Number.isFinite(percentBase)) {
            const sum = displayPairs.reduce((acc, pair) => acc + (Number(pair.value) || 0), 0);
            percentBase = sum > 0 ? sum : null;
        }

        return { displayPairs, percentBase };
    }

    shouldGenerateChartForQuestion(question) {
        const source = String(question || '').toLowerCase();
        if (!source) {
            return false;
        }

        const keywords = ['图表', 'chart', '柱状图', '饼图', '趋势图'];
        return keywords.some(keyword => source.includes(keyword));
    }

    normalizeQuestionText(question) {
        return String(question || '')
            .toLowerCase()
            .replace(/[\s\-_]+/g, '')
            .replace(/[，。！？、；：,.!?;:()（）【】\[\]"'“”‘’]/g, '');
    }

    getRequestedChartTypeFromQuestion(question) {
        const source = this.normalizeQuestionText(question);
        if (!source) {
            return null;
        }

        if (
            source.includes('饼图') ||
            source.includes('饼状图') ||
            source.includes('pie') ||
            source.includes('piechart')
        ) {
            return 'pie';
        }

        if (
            source.includes('柱状图') ||
            source.includes('条形图') ||
            source.includes('barchart') ||
            source.includes('bar')
        ) {
            return 'bar';
        }

        if (
            source.includes('趋势图') ||
            source.includes('折线图') ||
            source.includes('走势图') ||
            source.includes('linechart') ||
            source.includes('line') ||
            source.includes('trend')
        ) {
            return 'line';
        }

        return null;
    }

    extractTableChartConfig(messageDiv, content) {
        const text = String(content || '').trim();
        if (!text && !messageDiv) {
            return null;
        }

        // 优先解析 markdown 表格
        const markdownPairs = this.extractPairsFromMarkdownTable(text);
        const markdownResult = this.splitDisplayAndTotalPairs(markdownPairs);
        if (markdownResult.displayPairs.length >= 2) {
            const data = markdownResult.displayPairs.slice(0, 12);
            return {
                chartType: this.inferChartType(text, data.map(pair => pair.label), data),
                labels: data.map(pair => pair.label),
                values: data.map(pair => pair.value),
                percentBase: markdownResult.percentBase
            };
        }

        // 解析已渲染的 HTML 表格
        const renderedTablePairs = this.extractPairsFromRenderedTable(messageDiv);
        const renderedResult = this.splitDisplayAndTotalPairs(renderedTablePairs);
        if (renderedResult.displayPairs.length >= 2) {
            const data = renderedResult.displayPairs.slice(0, 12);
            return {
                chartType: this.inferChartType(text, data.map(pair => pair.label), data),
                labels: data.map(pair => pair.label),
                values: data.map(pair => pair.value),
                percentBase: renderedResult.percentBase
            };
        }

        // 解析制表符/多空格列（视作纯文本表格）
        const structuredPairs = this.extractPairsFromStructuredRows(text);
        const structuredResult = this.splitDisplayAndTotalPairs(structuredPairs);
        if (structuredResult.displayPairs.length >= 2) {
            const data = structuredResult.displayPairs.slice(0, 12);
            return {
                chartType: this.inferChartType(text, data.map(pair => pair.label), data),
                labels: data.map(pair => pair.label),
                values: data.map(pair => pair.value),
                percentBase: structuredResult.percentBase
            };
        }

        return null;
    }

    renderFallbackBarChart(chartWrapper, chartConfig) {
        const maxValue = Math.max(...chartConfig.values, 0);
        if (maxValue <= 0) {
            return;
        }

        const list = document.createElement('div');
        list.className = 'fallback-chart-list';

        chartConfig.labels.forEach((label, index) => {
            const value = chartConfig.values[index];
            const widthPercent = Math.max(4, Math.round((value / maxValue) * 100));

            const item = document.createElement('div');
            item.className = 'fallback-chart-item';

            const labelEl = document.createElement('div');
            labelEl.className = 'fallback-chart-label';
            labelEl.textContent = label;

            const track = document.createElement('div');
            track.className = 'fallback-chart-track';

            const bar = document.createElement('div');
            bar.className = 'fallback-chart-bar';
            bar.style.width = `${widthPercent}%`;

            const valueEl = document.createElement('span');
            valueEl.className = 'fallback-chart-value';
            valueEl.textContent = String(value);

            bar.appendChild(valueEl);
            track.appendChild(bar);
            item.appendChild(labelEl);
            item.appendChild(track);
            list.appendChild(item);
        });

        chartWrapper.appendChild(list);
    }

    inferChartType(content, labels, pairs) {
        const source = String(content || '');
        const hasTrendKeyword = /(趋势|走势|变化|按月|按周|按日|同比|环比|trend|timeline|over\s*time|time\s*series|month|week|day)/i.test(source);
        const hasRatioKeyword = /(占比|比例|构成|份额|百分比|distribution|ratio|share|composition)/i.test(source);
        const timeLikeCount = labels.filter(label => this.isTimeLikeLabel(label)).length;
        const hasPercentValue = pairs.some(pair => /%/.test(pair.rawValue));
        const total = pairs.reduce((sum, pair) => sum + pair.value, 0);
        const isNearHundred = Math.abs(total - 100) <= 2;

        if (hasTrendKeyword || timeLikeCount >= Math.max(2, Math.ceil(labels.length * 0.6))) {
            return 'line';
        }
        if (hasRatioKeyword || hasPercentValue || isNearHundred) {
            return 'pie';
        }
        return 'bar';
    }

    extractChartConfigFromContent(content) {
        const text = String(content || '').trim();
        if (!text) {
            return null;
        }

        let pairs = this.extractPairsFromMarkdownTable(text);
        if (pairs.length < 2) {
            pairs = this.extractPairsFromLines(text);
        }
        if (pairs.length < 2) {
            pairs = this.extractPairsFromStructuredRows(text);
        }
        if (pairs.length < 2) {
            return null;
        }

        const splitResult = this.splitDisplayAndTotalPairs(pairs);
        const maxPoints = 12;
        const normalized = splitResult.displayPairs
            .filter(pair => pair.label && Number.isFinite(pair.value))
            .slice(0, maxPoints);

        if (normalized.length < 2) {
            return null;
        }

        const labels = normalized.map(pair => pair.label);
        const values = normalized.map(pair => pair.value);
        const chartType = this.inferChartType(text, labels, normalized);

        return {
            chartType,
            labels,
            values,
            percentBase: splitResult.percentBase
        };
    }

    cleanupChartForMessage(messageId) {
        if (!messageId) {
            return;
        }
        const existingChart = this.chartInstances.get(messageId);
        if (existingChart) {
            existingChart.destroy();
            this.chartInstances.delete(messageId);
        }
    }

    createSvgElement(tag, attrs = {}) {
        const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.entries(attrs).forEach(([key, value]) => {
            element.setAttribute(key, String(value));
        });
        return element;
    }

    createSvgText(x, y, text, options = {}) {
        const textNode = this.createSvgElement('text', {
            x,
            y,
            fill: options.fill || '#4b5563',
            'font-size': options.fontSize || '10',
            'text-anchor': options.anchor || 'middle',
            'dominant-baseline': options.baseline || 'middle'
        });
        textNode.textContent = String(text ?? '');
        return textNode;
    }

    renderNativeBarChart(svg, labels, values, colors) {
        const width = 360;
        const height = 180;
        const margin = { top: 12, right: 10, bottom: 36, left: 34 };
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;
        const maxValue = Math.max(...values, 1);

        svg.appendChild(this.createSvgElement('line', {
            x1: margin.left,
            y1: margin.top + plotHeight,
            x2: width - margin.right,
            y2: margin.top + plotHeight,
            stroke: '#d1d5db',
            'stroke-width': 1
        }));

        const slotWidth = plotWidth / values.length;
        const barWidth = Math.max(8, Math.min(26, slotWidth * 0.62));

        values.forEach((value, index) => {
            const barHeight = (value / maxValue) * plotHeight;
            const x = margin.left + index * slotWidth + (slotWidth - barWidth) / 2;
            const y = margin.top + plotHeight - barHeight;

            svg.appendChild(this.createSvgElement('rect', {
                x,
                y,
                width: barWidth,
                height: Math.max(1, barHeight),
                rx: 3,
                fill: colors[index % colors.length]
            }));

            svg.appendChild(this.createSvgText(
                x + barWidth / 2,
                Math.max(6, y - 6),
                value,
                { fontSize: 9, fill: '#6b7280' }
            ));

            const label = labels[index].length > 6 ? `${labels[index].slice(0, 6)}…` : labels[index];
            svg.appendChild(this.createSvgText(
                x + barWidth / 2,
                height - 14,
                label,
                { fontSize: 9, fill: '#6b7280' }
            ));
        });
    }

    renderNativeLineChart(svg, labels, values, colors) {
        const width = 360;
        const height = 180;
        const margin = { top: 14, right: 10, bottom: 28, left: 34 };
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;
        const maxValue = Math.max(...values, 1);

        svg.appendChild(this.createSvgElement('line', {
            x1: margin.left,
            y1: margin.top + plotHeight,
            x2: width - margin.right,
            y2: margin.top + plotHeight,
            stroke: '#d1d5db',
            'stroke-width': 1
        }));

        const points = values.map((value, index) => {
            const x = margin.left + (index * plotWidth) / Math.max(values.length - 1, 1);
            const y = margin.top + plotHeight - (value / maxValue) * plotHeight;
            return { x, y, value, label: labels[index] };
        });

        const polyline = this.createSvgElement('polyline', {
            points: points.map(point => `${point.x},${point.y}`).join(' '),
            fill: 'none',
            stroke: '#ff000f',
            'stroke-width': 2
        });
        svg.appendChild(polyline);

        points.forEach((point, index) => {
            svg.appendChild(this.createSvgElement('circle', {
                cx: point.x,
                cy: point.y,
                r: 2.5,
                fill: colors[index % colors.length]
            }));

            if (index % Math.ceil(points.length / 6) === 0 || index === points.length - 1) {
                const label = point.label.length > 6 ? `${point.label.slice(0, 6)}…` : point.label;
                svg.appendChild(this.createSvgText(point.x, height - 10, label, { fontSize: 9 }));
            }
        });
    }

    renderNativePieChart(svg, labels, values, colors, percentBase = null) {
        const width = 360;
        const height = 180;
        const cx = 84;
        const cy = 90;
        const radius = 52;
        const displayTotal = values.reduce((sum, value) => sum + value, 0);
        if (displayTotal <= 0) {
            this.renderFallbackBarChart({ appendChild: (node) => svg.appendChild(node) }, { labels, values });
            return;
        }

        const safePercentBase = Number.isFinite(percentBase) && percentBase > 0
            ? Math.max(percentBase, displayTotal)
            : displayTotal;

        let startAngle = -Math.PI / 2;
        values.forEach((value, index) => {
            const angle = (value / displayTotal) * Math.PI * 2;
            const endAngle = startAngle + angle;
            const largeArc = angle > Math.PI ? 1 : 0;
            const x1 = cx + radius * Math.cos(startAngle);
            const y1 = cy + radius * Math.sin(startAngle);
            const x2 = cx + radius * Math.cos(endAngle);
            const y2 = cy + radius * Math.sin(endAngle);

            const pathData = [
                `M ${cx} ${cy}`,
                `L ${x1} ${y1}`,
                `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
                'Z'
            ].join(' ');

            svg.appendChild(this.createSvgElement('path', {
                d: pathData,
                fill: colors[index % colors.length]
            }));

            startAngle = endAngle;
        });

        const legendStartX = 160;
        labels.slice(0, 6).forEach((label, index) => {
            const y = 28 + index * 24;
            svg.appendChild(this.createSvgElement('rect', {
                x: legendStartX,
                y: y - 7,
                width: 10,
                height: 10,
                rx: 2,
                fill: colors[index % colors.length]
            }));
            const percent = Math.round((values[index] / safePercentBase) * 100);
            const legendText = `${label.length > 8 ? `${label.slice(0, 8)}…` : label} ${percent}%`;
            svg.appendChild(this.createSvgText(legendStartX + 16, y - 1, legendText, {
                fontSize: 10,
                fill: '#4b5563',
                anchor: 'start'
            }));
        });
    }

    renderNativeChart(chartWrapper, chartConfig, options = {}) {
        const expanded = !!options.expanded;
        const chartBody = document.createElement('div');
        chartBody.className = expanded ? 'message-chart-body chart-modal-body' : 'message-chart-body';

        const svg = this.createSvgElement('svg', {
            class: expanded ? 'message-chart-svg chart-modal-svg' : 'message-chart-svg',
            viewBox: '0 0 360 180',
            preserveAspectRatio: 'none'
        });

        const colors = ['#FF000F', '#FF4D5A', '#FF7A84', '#FCA5A5', '#FECACA', '#D1D5DB', '#9CA3AF', '#6B7280'];
        if (chartConfig.chartType === 'pie') {
            this.renderNativePieChart(svg, chartConfig.labels, chartConfig.values, colors, chartConfig.percentBase);
        } else if (chartConfig.chartType === 'line') {
            this.renderNativeLineChart(svg, chartConfig.labels, chartConfig.values, colors);
        } else {
            this.renderNativeBarChart(svg, chartConfig.labels, chartConfig.values, colors);
        }

        chartBody.appendChild(svg);
        chartWrapper.appendChild(chartBody);
    }

    ensureChartModal() {
        if (this.chartModal) {
            return this.chartModal;
        }

        const overlay = document.createElement('div');
        overlay.className = 'chart-modal-overlay hidden';

        const modal = document.createElement('div');
        modal.className = 'chart-modal';

        const header = document.createElement('div');
        header.className = 'chart-modal-header';

        const title = document.createElement('div');
        title.className = 'chart-modal-title';
        title.textContent = '图表详情';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'chart-modal-close';
        closeBtn.setAttribute('aria-label', '关闭图表弹窗');
        closeBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';

        const body = document.createElement('div');
        body.className = 'chart-modal-content';

        header.appendChild(title);
        header.appendChild(closeBtn);
        modal.appendChild(header);
        modal.appendChild(body);
        overlay.appendChild(modal);

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                this.closeChartModal();
            }
        });

        closeBtn.addEventListener('click', () => this.closeChartModal());

        document.body.appendChild(overlay);

        this.chartModal = {
            overlay,
            title,
            body,
        };

        return this.chartModal;
    }

    closeChartModal() {
        if (!this.chartModal) {
            return;
        }

        this.chartModal.overlay.classList.add('hidden');
        this.chartModal.body.innerHTML = '';
    }

    renderChartSummary(container, chartConfig) {
        const summary = document.createElement('div');
        summary.className = 'chart-modal-summary';

        chartConfig.labels.forEach((label, index) => {
            const item = document.createElement('div');
            item.className = 'chart-modal-summary-item';

            const labelEl = document.createElement('span');
            labelEl.className = 'chart-modal-summary-label';
            labelEl.textContent = label;

            const valueEl = document.createElement('span');
            valueEl.className = 'chart-modal-summary-value';
            valueEl.textContent = String(chartConfig.values[index]);

            item.appendChild(labelEl);
            item.appendChild(valueEl);
            summary.appendChild(item);
        });

        container.appendChild(summary);
    }

    openChartModal(chartConfig, chartTitleText = '图表详情') {
        if (!chartConfig) {
            return;
        }

        const modal = this.ensureChartModal();
        modal.title.textContent = chartTitleText;
        modal.body.innerHTML = '';

        const enlargedChartWrapper = document.createElement('div');
        enlargedChartWrapper.className = 'message-chart-wrapper chart-modal-chart-wrapper';

        const chartTitle = document.createElement('div');
        chartTitle.className = 'message-chart-title chart-modal-chart-title';
        chartTitle.textContent = '放大视图';

        enlargedChartWrapper.appendChild(chartTitle);
        this.renderNativeChart(enlargedChartWrapper, chartConfig, { expanded: true });
        modal.body.appendChild(enlargedChartWrapper);
        this.renderChartSummary(modal.body, chartConfig);
        modal.overlay.classList.remove('hidden');
    }

    tryRenderChartForMessage(messageDiv, content, userQuestion = '') {
        try {
            if (!messageDiv || !messageDiv.id) {
                return;
            }

            if (!this.shouldGenerateChartForQuestion(userQuestion)) {
                console.log('[Chart] User question has no chart keyword, skip rendering');
                return;
            }

        this.cleanupChartForMessage(messageDiv.id);
        const oldWrapper = messageDiv.querySelector('.message-chart-wrapper');
        if (oldWrapper) {
            oldWrapper.remove();
        }

        const chartConfig = this.extractTableChartConfig(messageDiv, content);

        if (!chartConfig) {
            console.log('[Chart] No table-form data detected, skip rendering');
            return;
        }

        const requestedType = this.getRequestedChartTypeFromQuestion(userQuestion);
        if (requestedType) {
            chartConfig.chartType = requestedType;
            console.log('[Chart] Using requested chart type:', requestedType, 'question:', userQuestion);
        }

        const contentDiv = messageDiv.querySelector('.message-content');
        if (!contentDiv) {
            return;
        }

        const chartWrapper = document.createElement('div');
        chartWrapper.className = 'message-chart-wrapper';
        chartWrapper.setAttribute('role', 'button');
        chartWrapper.setAttribute('tabindex', '0');
        chartWrapper.setAttribute('aria-label', '点击放大图表');
        chartWrapper.title = '点击放大图表';

        const chartTitle = document.createElement('div');
        chartTitle.className = 'message-chart-title';
        chartTitle.textContent = '数据可视化';

        chartWrapper.appendChild(chartTitle);

        const insertBeforeNode = contentDiv.querySelector('.message-feedback-actions') || contentDiv.querySelector('.message-disclaimer');
        if (insertBeforeNode) {
            contentDiv.insertBefore(chartWrapper, insertBeforeNode);
        } else {
            contentDiv.appendChild(chartWrapper);
        }

        this.renderNativeChart(chartWrapper, chartConfig);
        chartWrapper.addEventListener('click', () => {
            this.openChartModal({ ...chartConfig, labels: [...chartConfig.labels], values: [...chartConfig.values] }, '图表详情');
        });
        chartWrapper.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.openChartModal({ ...chartConfig, labels: [...chartConfig.labels], values: [...chartConfig.values] }, '图表详情');
            }
        });
        } catch (error) {
            console.error('[Chart] tryRenderChartForMessage error:', error);
        }
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
                const cleaned = this.removeArtifactText(this.cleanUpText(data));
                console.log('[formatMesData] Cleaned text:', cleaned);
                return cleaned;
            } catch (e) {
                // 不是有效的JSON，按普通字符串处理
                console.log('[formatMesData] Parse error, treating as plain text');
                const cleaned = this.removeArtifactText(this.cleanUpText(data));
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
                    cleanValue = this.removeArtifactText(this.cleanUpText(value));
                } else {
                    cleanValue = this.removeArtifactText(String(value));
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

    removeArtifactText(text) {
        const normalized = String(text || '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\\n/g, '\n')
            .replace(/[\u200B-\u200D\uFEFF]/g, '');

        return normalized
            .replace(/\b\d{10,}\.text\b/g, '')
            .replace(/(^|\n)[\t \f\v]*\.[\t \f\v]*(?=\n|$)/g, '$1')
            .replace(/^\s*$/gm, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }
    
    // 清理文本格式
    cleanUpText(text) {
        if (!text) return '';
        
        console.log('[cleanUpText] Input:', text);

        const normalized = text
            .replace(/^[\n\s]+|[\n\s]+$/g, '') // 去除首尾空白
            .replace(/\\n/g, '\n') // 处理转义的换行符
            .replace(/\r\n/g, '\n');

        const withoutArtifactLines = this.removeArtifactText(normalized);

        const result = withoutArtifactLines
            .split('\n')
            .filter((line) => !/^\s*\d{10,}\.text\s*$/.test(line.replace(/[\u200B-\u200D\uFEFF]/g, '')))
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
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
        await this.sendCurrentMessage();
    }

    async submitMessage(message, clearInput = false) {
        // 如果正在流式传输，阻止提交
        if (this.isStreaming) {
            console.log('Already streaming, ignoring submit');
            return;
        }

        let typingId = null;
        try {
            // Add user message to chat (with hard fallback)
            try {
                this.addMessage(message, 'user');
            } catch (renderError) {
                console.error('[Send] addMessage(user) failed, fallback to minimal bubble:', renderError);
                this.appendUserBubbleFallback(message);
            }

            this.updateSendButton(true);

            if (clearInput) {
                // Clear input
                this.messageInput.value = '';
                this.autoResize();
            }

            // Disable input while processing
            this.setInputState(false);

            // Show typing indicator
            typingId = this.showTypingIndicator();

            // Send message with streaming
            await this.sendMessageStream(message);
        } catch (error) {
            console.error('Error:', error);
            if (typingId) {
                this.removeMessage(typingId);
            }
            this.addMessage('抱歉，发生了错误。请稍后重试。', 'bot');
        } finally {
            this.setInputState(true);
            this.messageInput.focus();
        }
    }

    appendUserBubbleFallback(content) {
        if (!this.chatMessages) {
            return;
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message user-message';
        const bubble = document.createElement('div');
        bubble.className = 'message-content';
        const markdownBody = document.createElement('div');
        markdownBody.className = 'markdown-body';
        const p = document.createElement('p');
        p.textContent = String(content || '');
        markdownBody.appendChild(p);
        bubble.appendChild(markdownBody);
        messageDiv.appendChild(bubble);

        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    setBotMarkdownContent(container, content) {
        if (!container) {
            return;
        }

        container.innerHTML = this.markdownToHtml(this.removeArtifactText(content || ''));
    }

    async copyText(text) {
        const copyContent = text || '';
        if (!copyContent) {
            return;
        }

        try {
            await navigator.clipboard.writeText(copyContent);
        } catch (error) {
            const textarea = document.createElement('textarea');
            textarea.value = copyContent;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
    }
    
    async sendMessageStream(query) {
        console.log('=== SEND MESSAGE STREAM ===');
        console.log('Query:', query);
        console.log('Conversation ID:', this.conversationId);
        const requestStartedAt = performance.now();
        
        this.isStreaming = true;
        this.userStopped = false; // 重置停止标记
        this.abortController = new AbortController();
        const typingId = document.querySelector('.typing-indicator')?.closest('.message')?.id;
        let messageCreated = false;
        let messageDiv = null;
        let contentDiv = null;
        let difyMessageId = null;
        let fullAnswer = '';
        let streamContentMode = null;
        let streamingUiReleased = false;
        const flushUiFrame = async () => {
            await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        };
        const releaseStreamingUi = () => {
            if (streamingUiReleased) {
                return;
            }
            streamingUiReleased = true;
            this.isStreaming = false;
            this.updateSendButton(false);
        };
        const renderBotStreamAnswer = () => {
            if (!fullAnswer.trim()) {
                return;
            }

            if (typingId) {
                this.removeMessage(typingId);
            }

            const formattedAnswer = this.appendAvatarUrlDebug(this.formatMesData(fullAnswer));
            if (!messageCreated) {
                const messageId = 'msg_' + Date.now();
                messageDiv = this.createMessageElement(formattedAnswer, 'bot', messageId, difyMessageId);
                this.chatMessages.appendChild(messageDiv);
                contentDiv = messageDiv.querySelector('.markdown-body');
                messageCreated = true;
            } else if (contentDiv) {
                this.setBotMarkdownContent(contentDiv, formattedAnswer);
            }
            this.scrollToBottom();
        };
        const acceptStreamContent = (mode, text, replace = false) => {
            if (typeof text !== 'string' || !text) {
                return false;
            }

            if (mode !== 'workflow') {
                if (!streamContentMode) {
                    streamContentMode = mode;
                    console.log('[STREAM MODE] Selected content mode:', streamContentMode);
                }

                if (streamContentMode !== mode) {
                    console.log('[STREAM MODE] Ignoring event from', mode, 'because active mode is', streamContentMode);
                    return false;
                }
            } else {
                streamContentMode = mode;
            }

            if (replace) {
                fullAnswer = text;
            } else {
                fullAnswer += text;
            }

            return true;
        };
        
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
            
            // Read streaming response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let pendingSseLine = '';
            let streamShouldTerminate = false;
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = pendingSseLine + decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                pendingSseLine = lines.pop() || '';
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6).trim();
                        console.log('[RAW DATA LINE]', data);
                        if (data) {
                            let json = null;
                            try {
                                json = JSON.parse(data);
                            } catch (parseError) {
                                console.warn('Failed to parse JSON:', data, parseError);
                                continue;
                            }

                            console.log('=== Received event:', json.event, '===');
                            console.log('[FULL JSON]', JSON.stringify(json, null, 2));
                                
                            // Handle chat message events
                            if (json.event === 'message') {
                                console.log('[MESSAGE EVENT] Processing...');
                                if (json.conversation_id) {
                                    this.conversationId = json.conversation_id;
                                    console.log('Updated conversation_id (from message):', this.conversationId);
                                }
                                // Get the answer from message data
                                const answer = json.answer || '';
                                console.log('[MESSAGE EVENT] Raw answer TYPE:', typeof answer);
                                console.log('[MESSAGE EVENT] Raw answer LENGTH:', answer.length);
                                console.log('[MESSAGE EVENT] Raw answer VALUE:', answer);
                                console.log('[MESSAGE EVENT] Raw answer CHAR CODES:', Array.from(answer).map((c, i) => `${i}:${c}(${c.charCodeAt(0)})`).join(' '));
                                    
                                // Only process if answer is not empty (ignore empty message events from workflow apps)
                                if (answer) {
                                    if (!acceptStreamContent('message', answer, false)) {
                                        continue;
                                    }
                                    console.log('[MESSAGE EVENT] Accumulated answer length:', fullAnswer.length);
                                    console.log('[MESSAGE EVENT] messageCreated:', messageCreated);
                                    console.log('[MESSAGE EVENT] typingId:', typingId);

                                    const eventMessageId = json.message_id || json.id || null;
                                    if (eventMessageId && eventMessageId !== difyMessageId) {
                                        difyMessageId = eventMessageId;
                                    }

                                } else {
                                    console.log('[MESSAGE EVENT] Answer is empty - skipping (workflow app sends answer in workflow_finished)');
                                }
                            } else if (json.event === 'workflow_finished') {
                                console.log('[WORKFLOW_FINISHED EVENT] Processing...');
                                const workflowAnswer = json.data?.outputs?.answer || '';
                                if (json.conversation_id) {
                                    this.conversationId = json.conversation_id;
                                    console.log('Updated conversation_id (from workflow_finished):', this.conversationId);
                                }

                                if (typeof workflowAnswer === 'string' && workflowAnswer.trim()) {
                                    acceptStreamContent('workflow', workflowAnswer, true);
                                    renderBotStreamAnswer();
                                } else {
                                    console.log('[WORKFLOW_FINISHED EVENT] No answer in outputs.answer');
                                }
                                streamShouldTerminate = true;
                            } else if (json.event === 'message_end') {
                                // End of message - save conversation_id
                                if (json.conversation_id) {
                                    this.conversationId = json.conversation_id;
                                    console.log('Updated conversation_id:', this.conversationId);
                                }
                                const endMessageId = json.message_id || json.id || null;
                                if (endMessageId && endMessageId !== difyMessageId) {
                                    difyMessageId = endMessageId;
                                }
                                renderBotStreamAnswer();
                                if (difyMessageId) {
                                    this.setBotMessageId(messageDiv, difyMessageId, performance.now() - requestStartedAt);
                                }
                                streamShouldTerminate = true;
                            } else if (json.event === 'agent_message' || json.event === 'text_chunk') {
                                console.log('[AGENT_MESSAGE/TEXT_CHUNK EVENT] Processing...');
                                // Streaming text chunks - accumulate content
                                
                                // Append streaming text if available
                                if (json.data) {
                                    const chunkText = typeof json.data?.text === 'string'
                                        ? json.data.text
                                        : typeof json.data?.answer === 'string'
                                            ? json.data.answer
                                            : typeof json.data === 'string'
                                                ? json.data
                                                : '';
                                    if (typeof chunkText === 'string' && chunkText) {
                                        if (!acceptStreamContent('chunk', chunkText, false)) {
                                            continue;
                                        }
                                        console.log('[AGENT_MESSAGE/TEXT_CHUNK] Accumulated length:', fullAnswer.length);
                                        console.log('[AGENT_MESSAGE/TEXT_CHUNK] messageCreated:', messageCreated);
                                    }
                                }
                            } else if (json.event === 'node_finished') {
                                // 忽略 node_finished 事件
                                console.log('[NODE_FINISHED EVENT] Ignored');
                            } else if (json.event === 'workflow_started' || json.event === 'node_started') {
                                // 忽略 workflow/node started 事件
                                console.log('[' + json.event.toUpperCase() + ' EVENT] Ignored');
                            } else if (json.event === 'ping') {
                                // Heartbeat event, keep stream alive
                                console.debug('[PING EVENT] Keep-alive heartbeat');
                            } else if (json.event === 'error' || json.error) {
                                // Structured error event from backend
                                const streamError = new Error(json.user_message || json.error || '请求失败');
                                streamError.errorType = json.error_type || 'unknown';
                                streamError.rawError = json.error || '';
                                throw streamError;
                            } else {
                                // Unknown event, log it
                                console.log('Unknown event:', json.event, json);
                            }

                            if (streamShouldTerminate) {
                                break;
                            }
                        }
                    }
                }

                if (streamShouldTerminate) {
                    console.log('[STREAM] Terminal event received, ending stream reader early');
                    await reader.cancel();
                    pendingSseLine = '';
                    break;
                }

            }

            const tail = (pendingSseLine + decoder.decode()).trim();
            if (tail.startsWith('data: ')) {
                console.log('[SSE TAIL] Remaining buffered line detected after stream end');
                const data = tail.slice(6).trim();
                if (data) {
                    let json = null;
                    try {
                        json = JSON.parse(data);
                    } catch (parseError) {
                        console.warn('Failed to parse trailing JSON:', data, parseError);
                    }

                    if (json?.event === 'workflow_finished') {
                        const workflowAnswer = json.data?.outputs?.answer || '';
                        if (typeof workflowAnswer === 'string' && workflowAnswer.trim()) {
                            acceptStreamContent('workflow', workflowAnswer, true);
                            renderBotStreamAnswer();
                        }
                    }
                }
            }

            renderBotStreamAnswer();
            releaseStreamingUi();
            await flushUiFrame();
            
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
                    // 直接创建带有错误文本的消息，不要先创建空消息
                    const messageId = 'msg_' + Date.now();
                    messageDiv = this.createMessageElement('抱歉，没有收到响应。', 'bot', messageId);
                    this.chatMessages.appendChild(messageDiv);
                    console.log('[LOOP END] Created error message element with text');
                } else if (contentDiv) {
                    contentDiv.textContent = '抱歉，没有收到响应。';
                }
            } else {
                console.log('[LOOP END] Content received, no error message needed');
                if (messageDiv) {
                    const formattedAnswer = this.appendAvatarUrlDebug(this.formatMesData(fullAnswer));
                    this.tryRenderChartForMessage(messageDiv, formattedAnswer, query);
                    if (!messageDiv.querySelector('.message-duration')) {
                        this.setBotMessageDuration(messageDiv, performance.now() - requestStartedAt);
                    }
                }

                // Keep sidebar history fresh while it is open.
                if (this.sidebar && this.sidebar.classList.contains('open')) {
                    await this.loadConversations();
                }
                
                // 添加免责声明到最新的机器人消息
                this.addDisclaimerToLatestBotMessage();
            }
            
        } catch (error) {
            releaseStreamingUi();
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
                    const rawMessage = String(error?.message || '');
                    let displayMessage = `抱歉，发生了错误：${rawMessage}`;

                    if (error?.errorType === 'gateway_timeout') {
                        displayMessage = '抱歉，请求超时（可能是网关超时），请稍后重试。';
                    } else if (
                        error?.errorType === 'network_error' ||
                        /failed to fetch|network\s*error|networkerror|load failed/i.test(rawMessage)
                    ) {
                        displayMessage = '抱歉，网络连接异常，请检查网络后重试。';
                    } else if (error?.errorType === 'dify_api_error') {
                        displayMessage = '抱歉，Dify 服务返回异常，请稍后重试。';
                    }

                    // 直接创建带有错误文本的消息，不要先创建空消息
                    messageDiv = this.createMessageElement(displayMessage, 'bot', messageId);
                    this.chatMessages.appendChild(messageDiv);
                } else if (contentDiv) {
                    const rawMessage = String(error?.message || '');
                    let displayMessage = `抱歉，发生了错误：${rawMessage}`;

                    if (error?.errorType === 'gateway_timeout') {
                        displayMessage = '抱歉，请求超时（可能是网关超时），请稍后重试。';
                    } else if (
                        error?.errorType === 'network_error' ||
                        /failed to fetch|network\s*error|networkerror|load failed/i.test(rawMessage)
                    ) {
                        displayMessage = '抱歉，网络连接异常，请检查网络后重试。';
                    } else if (error?.errorType === 'dify_api_error') {
                        displayMessage = '抱歉，Dify 服务返回异常，请稍后重试。';
                    }

                    contentDiv.textContent = displayMessage;
                }
                this.addDisclaimerToLatestBotMessage();
            }
        } finally {
            releaseStreamingUi();
            this.abortController = null;
        }
    }
    
    addMessage(content, type, difyMessageId = null, userQuestion = '') {
        if (type === 'bot') {
            const oldDisclaimers = this.chatMessages.querySelectorAll('.message-disclaimer');
            oldDisclaimers.forEach(disclaimer => disclaimer.remove());
        }

        const messageId = 'msg_' + Date.now();
        const messageDiv = this.createMessageElement(content, type, messageId, difyMessageId);
        this.chatMessages.appendChild(messageDiv);
        if (type === 'bot') {
            this.tryRenderChartForMessage(messageDiv, content, userQuestion);
        }
        this.scrollToBottom();
        return messageId;
    }
    
    createMessageElement(content, type, id, difyMessageId = null) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;
        messageDiv.id = id;
        let userBody = null;

        if (type === 'bot' && difyMessageId) {
            messageDiv.dataset.difyMessageId = difyMessageId;
        }
        
        const avatar = document.createElement('div');
        avatar.className = `message-avatar ${type}-avatar`;
        if (type === 'bot') {
            avatar.textContent = '小易';
        } else {
            avatar.textContent = '';
            avatar.style.backgroundImage = `url("${this.getUserAvatarUrl()}")`;
        }
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        // 使用 markdown-body 作为内容容器
        const markdownBody = document.createElement('div');
        markdownBody.className = 'markdown-body';
        
        if (content) {
            if (type === 'bot') {
                this.setBotMarkdownContent(markdownBody, content);
            } else {
                const p = document.createElement('p');
                // 用户消息保持纯文本
                p.textContent = content;
                markdownBody.appendChild(p);
            }
        }

        contentDiv.appendChild(markdownBody);

        if (type === 'user') {
            const userActions = document.createElement('div');
            userActions.className = 'message-user-actions';

            const retryBtn = document.createElement('button');
            retryBtn.type = 'button';
            retryBtn.className = 'message-user-action-btn';
            retryBtn.title = '再次执行';
            retryBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/></svg>';

            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'message-user-action-btn';
            copyBtn.title = '复制问题';
            copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

            retryBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.submitMessage(content, false);
            });

            copyBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.copyText(content);
            });

            userActions.appendChild(retryBtn);
            userActions.appendChild(copyBtn);

            userBody = document.createElement('div');
            userBody.className = 'message-user-body';
            userBody.appendChild(contentDiv);
            userBody.appendChild(userActions);
        }

        if (type === 'bot') {
            const feedbackWrap = document.createElement('div');
            feedbackWrap.className = 'message-feedback-actions';

            const likeBtn = document.createElement('button');
            likeBtn.type = 'button';
            likeBtn.className = 'message-like-btn';
            likeBtn.title = '点赞';
            likeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-1 7v13h9a2 2 0 0 0 2-2l1-7a2 2 0 0 0-2-2h-6z"/><path d="M7 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h3"/></svg>';

            const dislikeBtn = document.createElement('button');
            dislikeBtn.type = 'button';
            dislikeBtn.className = 'message-dislike-btn';
            dislikeBtn.title = '点踩';
            dislikeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l1-7V2H5a2 2 0 0 0-2 2l-1 7a2 2 0 0 0 2 2h6z"/><path d="M17 2h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3"/></svg>';

            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'message-copy-btn';
            copyBtn.title = '复制回复';
            copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

            likeBtn.disabled = !difyMessageId;
            dislikeBtn.disabled = !difyMessageId;

            const submitFeedback = async (targetRating) => {
                const messageFeedbackId = messageDiv.dataset.difyMessageId;
                if (!messageFeedbackId || likeBtn.disabled || dislikeBtn.disabled) {
                    return;
                }

                const currentRating = messageDiv.dataset.feedbackRating || '';
                const nextRating = currentRating === targetRating ? null : targetRating;

                likeBtn.disabled = true;
                dislikeBtn.disabled = true;
                try {
                    await this.sendMessageFeedback(messageFeedbackId, nextRating, '');
                    this.setFeedbackState(messageDiv, nextRating);
                } catch (error) {
                    console.error('Feedback failed:', error);
                    alert('反馈失败，请重试');
                } finally {
                    likeBtn.disabled = false;
                    dislikeBtn.disabled = false;
                }
            };

            likeBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await submitFeedback('like');
            });

            dislikeBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await submitFeedback('dislike');
            });

            copyBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const markdownBody = messageDiv.querySelector('.markdown-body');
                const replyText = markdownBody ? markdownBody.textContent.trim() : '';
                await this.copyText(replyText);
            });

            feedbackWrap.appendChild(likeBtn);
            feedbackWrap.appendChild(dislikeBtn);
            feedbackWrap.appendChild(copyBtn);
            contentDiv.appendChild(feedbackWrap);
        }
        
        // 为机器人消息添加免责声明
        if (type === 'bot') {
            const disclaimer = document.createElement('div');
            disclaimer.className = 'message-disclaimer';
            disclaimer.style.cssText = 'color: #6c757d; font-size: 12px; margin-top: 8px; text-align: right; font-style: italic;';
            disclaimer.textContent = '- 数据仅供参考，需认真核对再使用 -';
            contentDiv.appendChild(disclaimer);
        }
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(type === 'user' && userBody ? userBody : contentDiv);
        
        return messageDiv;
    }

    addFeedbackButtons(messageDiv, difyMessageId = null) {
        if (!messageDiv) return;
        
        // 查找或创建内容容器
        let contentDiv = messageDiv.querySelector('.message-content');
        if (!contentDiv) return;
        
        // 检查是否已经有反馈按钮
        if (contentDiv.querySelector('.message-feedback-actions')) {
            return;
        }
        
        const feedbackWrap = document.createElement('div');
        feedbackWrap.className = 'message-feedback-actions';

        const likeBtn = document.createElement('button');
        likeBtn.type = 'button';
        likeBtn.className = 'message-like-btn';
        likeBtn.title = '点赞';
        likeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-1 7v13h9a2 2 0 0 0 2-2l1-7a2 2 0 0 0-2-2h-6z"/><path d="M7 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h3"/></svg>';

        const dislikeBtn = document.createElement('button');
        dislikeBtn.type = 'button';
        dislikeBtn.className = 'message-dislike-btn';
        dislikeBtn.title = '点踩';
        dislikeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l1-7V2H5a2 2 0 0 0-2 2l-1 7a2 2 0 0 0 2 2h6z"/><path d="M17 2h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3"/></svg>';

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'message-copy-btn';
        copyBtn.title = '复制回复';
        copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

        likeBtn.disabled = !difyMessageId;
        dislikeBtn.disabled = !difyMessageId;

        const submitFeedback = async (targetRating) => {
            const messageFeedbackId = messageDiv.dataset.difyMessageId;
            if (!messageFeedbackId || likeBtn.disabled || dislikeBtn.disabled) {
                return;
            }

            const currentRating = messageDiv.dataset.feedbackRating || '';
            const nextRating = currentRating === targetRating ? null : targetRating;

            likeBtn.disabled = true;
            dislikeBtn.disabled = true;
            try {
                await this.sendMessageFeedback(messageFeedbackId, nextRating, '');
                this.setFeedbackState(messageDiv, nextRating);
            } catch (error) {
                console.error('Feedback failed:', error);
                alert('反馈失败，请重试');
            } finally {
                likeBtn.disabled = false;
                dislikeBtn.disabled = false;
            }
        };

        likeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await submitFeedback('like');
        });

        dislikeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await submitFeedback('dislike');
        });

        copyBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const markdownBody = messageDiv.querySelector('.markdown-body');
            const replyText = markdownBody ? markdownBody.textContent.trim() : '';
            await this.copyText(replyText);
        });

        feedbackWrap.appendChild(likeBtn);
        feedbackWrap.appendChild(dislikeBtn);
        feedbackWrap.appendChild(copyBtn);
        
        // 在免责声明之前插入反馈按钮
        const disclaimer = contentDiv.querySelector('.message-disclaimer');
        if (disclaimer) {
            contentDiv.insertBefore(feedbackWrap, disclaimer);
        } else {
            contentDiv.appendChild(feedbackWrap);
        }
    }

    setBotMessageId(messageDiv, difyMessageId, elapsedMs = null) {
        if (!messageDiv || !difyMessageId) {
            return;
        }

        messageDiv.dataset.difyMessageId = difyMessageId;
        const actionBtns = messageDiv.querySelectorAll('.message-like-btn, .message-dislike-btn');
        actionBtns.forEach((btn) => {
            btn.disabled = false;
        });

        if (elapsedMs !== null) {
            this.setBotMessageDuration(messageDiv, elapsedMs);
        }
    }

    formatElapsedTime(elapsedMs) {
        const safeElapsed = Math.max(0, Number(elapsedMs) || 0);
        if (safeElapsed < 1000) {
            return `${Math.max(1, Math.round(safeElapsed))}ms`;
        }
        if (safeElapsed < 10000) {
            return `${(safeElapsed / 1000).toFixed(1)}s`;
        }
        return `${Math.round(safeElapsed / 1000)}s`;
    }

    setBotMessageDuration(messageDiv, elapsedMs) {
        if (!messageDiv) {
            return;
        }

        const contentDiv = messageDiv.querySelector('.message-content');
        if (!contentDiv) {
            return;
        }

        let durationEl = contentDiv.querySelector('.message-duration');
        if (!durationEl) {
            durationEl = document.createElement('span');
            durationEl.className = 'message-duration';
        }

        durationEl.textContent = `总耗时：${this.formatElapsedTime(elapsedMs)}`;
        contentDiv.appendChild(durationEl);
    }

    setFeedbackState(messageDiv, rating) {
        if (!messageDiv) {
            return;
        }

        if (rating) {
            messageDiv.dataset.feedbackRating = rating;
        } else {
            delete messageDiv.dataset.feedbackRating;
        }

        const likeBtn = messageDiv.querySelector('.message-like-btn');
        const dislikeBtn = messageDiv.querySelector('.message-dislike-btn');

        if (likeBtn) {
            likeBtn.classList.toggle('feedback-liked', rating === 'like');
        }
        if (dislikeBtn) {
            dislikeBtn.classList.toggle('feedback-disliked', rating === 'dislike');
        }
    }

    async sendMessageFeedback(messageId, rating = 'like', content = '') {
        const response = await fetch(`/api/v1/messages/${messageId}/feedbacks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                rating,
                user: this.userId,
                content
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send feedback');
        }

        return response.json();
    }

    getDifyMessageId(message) {
        if (!message) {
            return null;
        }
        return message.message_id || message.id || null;
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
            const dot = document.createElement('span');
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
        this.cleanupChartForMessage(messageId);
        const message = document.getElementById(messageId);
        if (message) {
            message.remove();
        }
    }
    
    clearChat() {
        this.chartInstances.forEach((chart) => chart.destroy());
        this.chartInstances.clear();
        this.chatMessages.innerHTML = '';
        this.conversationId = null;
        console.log('Started new conversation');
    }
    
    // Sidebar methods
    async openSidebar() {
        this.sidebar.classList.add('open');
        this.sidebarOverlay.classList.add('show');
        await this.loadConversations();
    }
    
    closeSidebarPanel() {
        this.sidebar.classList.remove('open');
        this.sidebarOverlay.classList.remove('show');
        this.closeAllConversationMenus();
        if (this.isMultiSelectMode) {
            this.toggleMultiSelectMode(false);
        }
    }

    toggleMultiSelectMode(forceMode = null) {
        const nextMode = typeof forceMode === 'boolean' ? forceMode : !this.isMultiSelectMode;
        this.isMultiSelectMode = nextMode;
        if (!nextMode) {
            this.selectedConversationIds.clear();
            this.closeAllConversationMenus();
        }
        this.updateBulkActionsBar();
        this.loadConversations();
    }

    updateBulkActionsBar() {
        if (this.bulkActionsBar) {
            this.bulkActionsBar.classList.toggle('hidden', !this.isMultiSelectMode);
        }
        if (this.multiSelectBtn) {
            this.multiSelectBtn.classList.toggle('active', this.isMultiSelectMode);
            this.multiSelectBtn.title = this.isMultiSelectMode ? '退出多选' : '多选删除';
        }
        if (this.selectedCountText) {
            this.selectedCountText.textContent = `已选择 ${this.selectedConversationIds.size} 项`;
        }
        if (this.bulkDeleteBtn) {
            this.bulkDeleteBtn.disabled = this.selectedConversationIds.size === 0;
        }
    }

    toggleConversationSelection(conversationId, selected) {
        if (!conversationId) {
            return;
        }
        if (selected) {
            this.selectedConversationIds.add(conversationId);
        } else {
            this.selectedConversationIds.delete(conversationId);
        }
        this.updateBulkActionsBar();
    }

    showBulkDeleteConfirmDialog(count) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'delete-confirm-overlay';

            const modal = document.createElement('div');
            modal.className = 'delete-confirm-modal';
            modal.innerHTML = `
                <div class="delete-confirm-title">确认批量删除？</div>
                <div class="delete-confirm-text">将删除选中的 ${count} 条会话及其聊天记录，此操作不可恢复。</div>
                <div class="delete-confirm-actions">
                    <button type="button" class="delete-confirm-cancel">取消</button>
                    <button type="button" class="delete-confirm-ok">删除</button>
                </div>
            `;

            const close = (result) => {
                overlay.remove();
                resolve(result);
            };

            overlay.addEventListener('click', () => close(false));
            modal.addEventListener('click', (e) => e.stopPropagation());
            modal.querySelector('.delete-confirm-cancel').addEventListener('click', () => close(false));
            modal.querySelector('.delete-confirm-ok').addEventListener('click', () => close(true));

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
        });
    }

    async handleBulkDeleteConversations() {
        const selectedIds = Array.from(this.selectedConversationIds);
        if (!selectedIds.length) {
            return;
        }

        const confirmed = await this.showBulkDeleteConfirmDialog(selectedIds.length);
        if (!confirmed) {
            return;
        }

        try {
            const results = await Promise.allSettled(
                selectedIds.map((conversationId) =>
                    fetch(`/api/v1/conversations/${conversationId}`, {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ user: this.userId })
                    })
                )
            );

            let failedCount = 0;
            results.forEach((result, index) => {
                if (result.status !== 'fulfilled' || !result.value.ok) {
                    failedCount += 1;
                    return;
                }

                if (this.conversationId === selectedIds[index]) {
                    this.clearChat();
                }
            });

            this.selectedConversationIds.clear();
            this.updateBulkActionsBar();
            await this.loadConversations();

            if (failedCount > 0) {
                alert(`已完成批量删除，但有 ${failedCount} 条删除失败，请重试。`);
            }

            if (this.isMultiSelectMode && this.selectedConversationIds.size === 0) {
                this.toggleMultiSelectMode(false);
            }
        } catch (error) {
            console.error('Error deleting multiple conversations:', error);
            alert('批量删除失败，请重试');
        }
    }
    
    async loadConversations() {
        try {
            this.conversationList.innerHTML = '<div class="loading-conversations"><div class="spinner"></div><span>加载中...</span></div>';
            
            const response = await fetch(`/api/v1/conversations?user=${this.userId}&limit=80&sort_by=-updated_at`);
            if (!response.ok) {
                throw new Error('Failed to load conversations');
            }
            
            const data = await response.json();
            this.renderConversations(data.data || []);
        } catch (error) {
            console.error('Error loading conversations:', error);
            this.conversationList.innerHTML = '<div class="no-conversations">加载失败，请重试</div>';
        }
    }
    
    renderConversations(conversations) {
        if (!conversations || conversations.length === 0) {
            this.conversationList.innerHTML = '<div class="no-conversations">暂无历史会话</div>';
            this.selectedConversationIds.clear();
            this.updateBulkActionsBar();
            return;
        }
        
        this.conversationList.innerHTML = '';
        // 后端按更新时间倒序返回，前端直接渲染。
        conversations.forEach(conv => {
            const item = document.createElement('div');
            item.className = 'conversation-item';
            if (this.isMultiSelectMode) {
                item.classList.add('select-mode');
            }
            if (conv.id === this.conversationId) {
                item.classList.add('active');
            }

            if (this.isMultiSelectMode) {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'conversation-item-select';
                checkbox.checked = this.selectedConversationIds.has(conv.id);
                checkbox.addEventListener('click', (e) => e.stopPropagation());
                checkbox.addEventListener('change', () => {
                    this.toggleConversationSelection(conv.id, checkbox.checked);
                    item.classList.toggle('active', checkbox.checked);
                });
                item.appendChild(checkbox);
            }

            const main = document.createElement('div');
            main.className = 'conversation-main';
            
            const name = document.createElement('div');
            name.className = 'conversation-name';
            name.textContent = conv.name || '新对话';
            
            const time = document.createElement('div');
            time.className = 'conversation-time';
            time.textContent = this.formatTimestamp(conv.updated_at || conv.created_at);

            const actions = document.createElement('div');
            actions.className = 'conversation-actions';

            const menuBtn = document.createElement('button');
            menuBtn.className = 'conversation-menu-btn';
            menuBtn.type = 'button';
            menuBtn.title = '更多操作';
            menuBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';

            const menu = document.createElement('div');
            menu.className = 'conversation-item-menu';
            menu.innerHTML = '<button type="button" class="conversation-delete-btn" title="删除会话"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg></button>';

            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleConversationMenu(menu);
            });

            menu.addEventListener('click', (e) => e.stopPropagation());

            const deleteBtn = menu.querySelector('.conversation-delete-btn');
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                this.closeAllConversationMenus();
                await this.handleDeleteConversation(conv.id, conv.name || '新对话');
            });

            if (!this.isMultiSelectMode) {
                actions.appendChild(menuBtn);
                actions.appendChild(menu);
            }

            main.appendChild(name);
            main.appendChild(time);
            
            item.appendChild(main);
            if (!this.isMultiSelectMode) {
                item.appendChild(actions);
            }
            
            item.addEventListener('click', () => {
                if (this.isMultiSelectMode) {
                    const nextChecked = !this.selectedConversationIds.has(conv.id);
                    this.toggleConversationSelection(conv.id, nextChecked);
                    const checkbox = item.querySelector('.conversation-item-select');
                    if (checkbox) {
                        checkbox.checked = nextChecked;
                    }
                    item.classList.toggle('active', nextChecked);
                    return;
                }
                this.loadConversation(conv.id);
            });
            
            this.conversationList.appendChild(item);
        });

        this.updateBulkActionsBar();
    }

    toggleConversationMenu(menuElement) {
        if (this.activeConversationMenu && this.activeConversationMenu !== menuElement) {
            this.activeConversationMenu.classList.remove('show');
            this.activeConversationMenu.closest('.conversation-item')?.classList.remove('menu-open');
        }

        const shouldShow = !menuElement.classList.contains('show');
        this.closeAllConversationMenus();
        if (shouldShow) {
            menuElement.classList.add('show');
            menuElement.closest('.conversation-item')?.classList.add('menu-open');
            this.activeConversationMenu = menuElement;
        }
    }

    closeAllConversationMenus() {
        const menus = this.conversationList.querySelectorAll('.conversation-item-menu.show');
        menus.forEach(menu => {
            menu.classList.remove('show');
            menu.closest('.conversation-item')?.classList.remove('menu-open');
        });
        this.activeConversationMenu = null;
    }

    async handleDeleteConversation(conversationId, conversationName) {
        const confirmed = await this.showDeleteConfirmDialog(conversationName);
        if (!confirmed) {
            return;
        }

        try {
            const response = await fetch(`/api/v1/conversations/${conversationId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ user: this.userId })
            });

            if (!response.ok) {
                throw new Error('Failed to delete conversation');
            }

            if (this.conversationId === conversationId) {
                this.clearChat();
            }

            await this.loadConversations();
        } catch (error) {
            console.error('Error deleting conversation:', error);
            alert('删除会话失败，请重试');
        }
    }

    showDeleteConfirmDialog(conversationName) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'delete-confirm-overlay';

            const modal = document.createElement('div');
            modal.className = 'delete-confirm-modal';
            modal.innerHTML = `
                <div class="delete-confirm-title">确认删除会话？</div>
                <div class="delete-confirm-text">将删除「${this.escapeHtml(conversationName)}」及其聊天记录，此操作不可恢复。</div>
                <div class="delete-confirm-actions">
                    <button type="button" class="delete-confirm-cancel">取消</button>
                    <button type="button" class="delete-confirm-ok">删除</button>
                </div>
            `;

            const close = (result) => {
                overlay.remove();
                resolve(result);
            };

            overlay.addEventListener('click', () => close(false));
            modal.addEventListener('click', (e) => e.stopPropagation());
            modal.querySelector('.delete-confirm-cancel').addEventListener('click', () => close(false));
            modal.querySelector('.delete-confirm-ok').addEventListener('click', () => close(true));

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
        });
    }
    
    async loadConversation(conversationId) {
        try {
            // 关闭侧边栏
            this.closeSidebarPanel();
            
            // 清空当前聊天
            this.chatMessages.innerHTML = '';
            this.conversationId = conversationId;
            
            // 显示加载提示
            const loadingId = this.showTypingIndicator();
            
            // 加载会话消息
            const response = await fetch(`/api/v1/conversations/${conversationId}/messages?user=${this.userId}`);
            if (!response.ok) {
                throw new Error('Failed to load messages');
            }
            
            const data = await response.json();
            this.removeMessage(loadingId);
            
            // 渲染消息
            if (data.data && data.data.length > 0) {
                // 按后端返回的顺序显示消息
                const messages = data.data;
                messages.forEach(msg => {
                    // 显示用户消息
                    if (msg.query) {
                        this.addMessage(msg.query, 'user');
                    }
                    // 显示机器人回复
                    if (msg.answer) {
                        this.addMessage(msg.answer, 'bot', this.getDifyMessageId(msg), msg.query || '');
                    }
                });
            }
            
            this.scrollToBottom();
        } catch (error) {
            console.error('Error loading conversation:', error);
            alert('加载会话失败，请重试');
        }
    }
    
    formatTimestamp(timestamp) {
        if (!timestamp) return '';
        
        const date = new Date(timestamp * 1000);
        const now = new Date();
        const diff = now - date;
        
        // 小于1分钟
        if (diff < 60000) {
            return '刚刚';
        }
        // 小于1小时
        if (diff < 3600000) {
            return `${Math.floor(diff / 60000)}分钟前`;
        }
        // 小于1天
        if (diff < 86400000) {
            return `${Math.floor(diff / 3600000)}小时前`;
        }
        // 小于7天
        if (diff < 604800000) {
            return `${Math.floor(diff / 86400000)}天前`;
        }
        
        // 超过7天，显示具体日期
        return `${date.getMonth() + 1}/${date.getDate()}`;
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

            const durationEl = contentDiv ? contentDiv.querySelector('.message-duration') : null;
            if (durationEl) {
                // Ensure duration stays at the very bottom.
                contentDiv.appendChild(durationEl);
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
