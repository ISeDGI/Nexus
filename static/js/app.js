let currentChatId = null;
let currentChatUserId = null;
const userId = window.userId || 0;

const messagesDiv = document.getElementById('messages');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');

console.log('🚀 userId:', userId);

// ============ ОТКРЫТЬ ЧАТ ============
function openChat(chatId, otherUserId) {
    console.log('📂 Открываем чат:', chatId);
    currentChatId = chatId;
    currentChatUserId = otherUserId;
    document.getElementById('current-chat-name').textContent = 'Чат открыт';
    loadMessages(chatId);
}

// ============ ЗАГРУЗКА СООБЩЕНИЙ (САМАЯ ПРОСТАЯ) ============
async function loadMessages(chatId) {
    console.log('📨 Загружаем:', chatId);
    try {
        const resp = await fetch('/api/messages/' + chatId);
        const messages = await resp.json();
        console.log('📨 Сообщения:', messages);

        if (messages.length === 0) {
            messagesDiv.innerHTML = '<div style="padding:20px;text-align:center;color:#999;">Нет сообщений</div>';
            return;
        }

        // Показываем ВСЕ сообщения
        let html = '';
        messages.forEach(msg => {
            const isOwn = (msg.sender_id == userId);
            html += `
                <div style="text-align:${isOwn ? 'right' : 'left'}; margin:5px 0; padding:8px 12px; background:${isOwn ? '#DCF8C6' : 'white'}; border-radius:10px; max-width:70%; ${isOwn ? 'margin-left:auto;' : ''}">
                    <div style="font-size:12px;color:#25D366;font-weight:bold;">${msg.display_name || msg.username}</div>
                    <div>${msg.text}</div>
                    <div style="font-size:10px;color:#999;">${new Date(msg.timestamp).toLocaleTimeString()}</div>
                </div>
            `;
        });
        messagesDiv.innerHTML = html;
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        console.log('✅ Отображено сообщений:', messages.length);
    } catch (e) {
        console.error('❌ Ошибка:', e);
        messagesDiv.innerHTML = '<div style="color:red;">Ошибка загрузки</div>';
    }
}

// ============ ОТПРАВКА ============
async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || !currentChatId) {
        alert('Выберите чат и напишите текст');
        return;
    }

    try {
        const resp = await fetch('/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: currentChatId,
                chat_type: 'private',
                text: text
            })
        });
        if (resp.ok) {
            msgInput.value = '';
            loadMessages(currentChatId);
        }
    } catch (e) {
        console.error('Ошибка отправки:', e);
    }
}

// ============ ПОИСК ============
document.getElementById('search-input').addEventListener('input', async function() {
    const query = this.value.trim();
    const results = document.getElementById('search-results');
    if (query.length < 1) {
        results.style.display = 'none';
        return;
    }

    try {
        const resp = await fetch('/api/users?search=' + encodeURIComponent(query));
        const users = await resp.json();
        results.innerHTML = users.map(u => `
            <div class="result-item" onclick="startChat(${u.id})">
                ${u.display_name || u.username} (@${u.username})
            </div>
        `).join('');
        results.style.display = 'block';
    } catch (e) {
        console.error(e);
    }
});

// ============ НАЧАТЬ ЧАТ ============
function startChat(otherUserId) {
    const chatId = 'user_' + otherUserId;
    openChat(chatId, otherUserId);
    document.getElementById('search-results').style.display = 'none';
    document.getElementById('search-input').value = '';
}

// ============ ОБРАБОТЧИКИ ============
sendBtn.addEventListener('click', sendMessage);
msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// ============ АВТООБНОВЛЕНИЕ ============
setInterval(() => {
    if (currentChatId) {
        console.log('🔄 Автообновление');
        loadMessages(currentChatId);
    }
}, 5000);

console.log('✅ Минимальный чат загружен');