let currentChatId = null;
let currentChatType = null;
let currentChatName = '';
let currentChatUserId = null;
let currentGroupId = null;
let isFirstLoad = true;
let chatsLoaded = false;
let lastChatsData = '';

const messagesDiv = document.getElementById('messages');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
const privateChatsDiv = document.getElementById('private-chats');
const groupChatsDiv = document.getElementById('group-chats');
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const currentChatNameSpan = document.getElementById('current-chat-name');
const chatHeaderAvatar = document.getElementById('chat-avatar');
const fileInput = document.getElementById('file-input');
const attachBtn = document.getElementById('attach-btn');
const recordBtn = document.getElementById('record-btn');

const userId = window.userId || 0;
console.log('🚀 Nexus запущен, userId:', userId);

// ============ ПРИЯТНЫЙ ЗВУК ============
function playNotificationSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const now = audioCtx.currentTime;
        const notes = [523, 659];
        notes.forEach((freq, i) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = freq;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.12, now + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.15);
            osc.start(now + i * 0.1);
            osc.stop(now + i * 0.1 + 0.15);
        });
    } catch (e) {}
}

// ============ УВЕДОМЛЕНИЕ ============
function showBrowserNotification(title, body) {
    if (Notification.permission === 'granted') {
        new Notification('💬 Nexus', { 
            body: `${title}: ${body}`,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💬</text></svg>'
        });
    }
}

if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// ============ АВАТАРЫ ============
function getAvatarHtml(avatar, name) {
    if (avatar) {
        return `<img src="${avatar}" alt="${name}" onerror="this.style.display='none';this.parentElement.textContent='${(name||'?')[0].toUpperCase()}'">`;
    }
    return (name || '?')[0].toUpperCase();
}

// ============ ОБНОВЛЕНИЕ АВАТАРКИ В ШАПКЕ ============
async function updateHeaderAvatar() {
    try {
        const resp = await fetch(`/api/profile/${userId}?user_id=${userId}&t=${Date.now()}`);
        const user = await resp.json();
        const headerAvatar = document.getElementById('header-avatar');
        if (headerAvatar) {
            headerAvatar.innerHTML = getAvatarHtml(user.avatar, user.display_name || user.username);
        }
        const usernameDisplay = document.getElementById('username-display');
        if (usernameDisplay) {
            usernameDisplay.textContent = user.display_name || user.username;
        }
    } catch (e) {
        console.error('Ошибка обновления аватарки в шапке:', e);
    }
}

// ============ ОБНОВЛЕНИЕ АВАТАРКИ В ШАПКЕ ЧАТА ============
async function updateChatHeaderAvatar(userIdToShow, groupId) {
    if (groupId) {
        // Если группа — показываем аватар группы
        if (chatHeaderAvatar) {
            chatHeaderAvatar.textContent = '👥';
        }
        return;
    }
    if (!userIdToShow) return;
    try {
        const resp = await fetch(`/api/profile/${userIdToShow}?user_id=${userId}&t=${Date.now()}`);
        if (!resp.ok) {
            if (chatHeaderAvatar) {
                chatHeaderAvatar.textContent = '👤';
            }
            return;
        }
        const user = await resp.json();
        if (chatHeaderAvatar) {
            chatHeaderAvatar.innerHTML = getAvatarHtml(user.avatar, user.display_name || user.username);
        }
        if (currentChatNameSpan) {
            currentChatNameSpan.textContent = user.display_name || user.username;
        }
    } catch (e) {
        console.error('Ошибка обновления аватарки в шапке чата:', e);
        if (chatHeaderAvatar) {
            chatHeaderAvatar.textContent = '👤';
        }
    }
}

// ============ СЧЁТЧИК НЕПРОЧИТАННЫХ ============
let unreadCounts = {};

function updateUnreadBadge(chatId, count) {
    const badge = document.querySelector(`.chat-item[data-chat-id="${chatId}"] .unread-badge`);
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
    const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
    document.title = totalUnread > 0 ? `(${totalUnread}) Nexus` : 'Nexus';
}

// ============ ЗАГРУЗКА ЧАТОВ ============
async function loadChats() {
    try {
        const resp = await fetch(`/api/chats?user_id=${userId}&t=${Date.now()}`);
        const data = await resp.json();
        const newDataStr = JSON.stringify(data);
        
        if (newDataStr === lastChatsData && chatsLoaded) {
            return;
        }
        lastChatsData = newDataStr;
        chatsLoaded = true;
        
        privateChatsDiv.innerHTML = data.private.map(p => {
            const chatId = `user_${p.id}`;
            const unread = unreadCounts[chatId] || 0;
            return `
                <div class="chat-item" data-chat-id="${chatId}" onclick="openChat('private', '${chatId}', '${p.display_name || p.username}', ${p.id})">
                    <div class="chat-avatar">${getAvatarHtml(p.avatar, p.display_name || p.username)}</div>
                    <div style="flex:1;display:flex;justify-content:space-between;align-items:center;">
                        <span class="chat-name">${p.display_name || p.username}</span>
                        ${unread > 0 ? `<span class="unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        groupChatsDiv.innerHTML = data.groups.map(g => `
            <div class="chat-item" onclick="openChat('group', 'group_${g.id}', '${g.name}', null, ${g.id})">
                <div class="chat-avatar">👥</div>
                <div style="flex:1;display:flex;justify-content:space-between;align-items:center;">
                    <span class="chat-name">${g.name}</span>
                    <span style="font-size:11px;color:#999;">${g.creator_display_name || g.creator}</span>
                </div>
            </div>
        `).join('');
        
        updateHeaderAvatar();
    } catch (error) {
        console.error('Ошибка загрузки чатов:', error);
    }
}

// ============ ОТКРЫТЬ ЧАТ ============
function openChat(type, chatId, name, otherUserId = null, groupId = null) {
    currentChatId = chatId;
    currentChatType = type;
    currentChatName = name;
    currentChatUserId = otherUserId;
    currentGroupId = groupId;
    currentChatNameSpan.textContent = name;
    
    if (groupId) {
        updateChatHeaderAvatar(null, groupId);
        // Добавляем кнопку просмотра группы
        const infoBtn = document.getElementById('group-info-btn');
        if (infoBtn) infoBtn.style.display = 'inline-block';
    } else {
        updateChatHeaderAvatar(otherUserId);
        const infoBtn = document.getElementById('group-info-btn');
        if (infoBtn) infoBtn.style.display = 'none';
    }
    
    if (unreadCounts[chatId]) {
        unreadCounts[chatId] = 0;
        updateUnreadBadge(chatId, 0);
    }
    
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    if (event && event.target) {
        const item = event.target.closest('.chat-item');
        if (item) item.classList.add('active');
    }
    
    loadMessages(chatId);
}

// ============ ЗАГРУЗКА СООБЩЕНИЙ ============
let lastMessageCount = 0;
let lastMessageChatId = null;
let lastMessagesHtml = '';

async function loadMessages(chatId) {
    try {
        const resp = await fetch(`/api/messages/${chatId}?user_id=${userId}&t=${Date.now()}`);
        if (!resp.ok) {
            messagesDiv.innerHTML = '<div style="color:red;text-align:center;padding:20px;">Ошибка загрузки</div>';
            return;
        }
        const messages = await resp.json();
        
        if (lastMessageChatId === chatId && messages.length > lastMessageCount) {
            const newMessages = messages.slice(lastMessageCount);
            const unread = newMessages.filter(msg => msg.sender_id != userId);
            if (unread.length > 0) {
                if (currentChatId !== chatId) {
                    unreadCounts[chatId] = (unreadCounts[chatId] || 0) + unread.length;
                    updateUnreadBadge(chatId, unreadCounts[chatId]);
                }
                const lastMsg = unread[unread.length - 1];
                if (lastMsg.sender_id != userId) {
                    playNotificationSound();
                    showBrowserNotification(
                        lastMsg.display_name || lastMsg.username,
                        lastMsg.text || '📎 Файл'
                    );
                }
            }
        }
        lastMessageCount = messages.length;
        lastMessageChatId = chatId;
        
        if (messages.length === 0) {
            if (!isFirstLoad && messagesDiv.innerHTML.includes('Нет сообщений')) {
                return;
            }
            messagesDiv.innerHTML = '<div style="color:#999;text-align:center;padding:20px;">Нет сообщений</div>';
            isFirstLoad = false;
            return;
        }
        
        const avatarCache = {};
        for (const msg of messages) {
            if (msg.sender_id != userId && !avatarCache[msg.sender_id]) {
                try {
                    const profileResp = await fetch(`/api/profile/${msg.sender_id}?user_id=${userId}&t=${Date.now()}`);
                    if (profileResp.ok) {
                        const profile = await profileResp.json();
                        avatarCache[msg.sender_id] = profile.avatar;
                    } else {
                        avatarCache[msg.sender_id] = null;
                    }
                } catch (e) {
                    avatarCache[msg.sender_id] = null;
                }
            }
        }
        
        let html = '';
        messages.forEach(msg => {
            const isOwn = msg.sender_id == userId;
            let content = msg.text || '';
            
            if (msg.file_path) {
                const ext = msg.file_path.split('.').pop().toLowerCase();
                const fileUrl = msg.file_path;
                if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
                    content = `<img src="${fileUrl}" alt="Изображение" style="max-width:200px;border-radius:10px;display:block;margin-top:4px;">`;
                } else if (['mp4', 'webm', 'mov'].includes(ext)) {
                    content = `<video src="${fileUrl}" controls style="max-width:200px;border-radius:10px;display:block;margin-top:4px;"></video>`;
                } else if (['mp3', 'wav', 'ogg', 'webm'].includes(ext) && !['mp4'].includes(ext)) {
                    content = `<audio src="${fileUrl}" controls style="width:150px;height:40px;margin-top:4px;"></audio>`;
                } else {
                    content = `<a href="${fileUrl}" download style="display:inline-block;padding:6px 12px;background:#f1f3f5;border-radius:8px;text-decoration:none;color:#007AFF;font-size:13px;margin-top:4px;">📎 Скачать файл</a>`;
                }
            }
            
            let avatar = null;
            if (!isOwn) {
                avatar = avatarCache[msg.sender_id] || msg.avatar;
            }
            const avatarHtml = !isOwn ? `<div class="chat-avatar" style="width:32px;height:32px;font-size:12px;flex-shrink:0;">${getAvatarHtml(avatar, msg.display_name || msg.username)}</div>` : '';
            
            html += `<div class="message ${isOwn ? 'own' : 'other'}">
                <div style="display:flex;align-items:flex-start;gap:10px;">
                    ${avatarHtml}
                    <div>
                        <span class="msg-username">${msg.display_name || msg.username}</span>
                        ${content}
                        <span class="msg-time">${new Date(msg.timestamp).toLocaleTimeString()}</span>
                    </div>
                </div>
            </div>`;
        });
        
        if (html !== lastMessagesHtml || isFirstLoad) {
            messagesDiv.innerHTML = html;
            lastMessagesHtml = html;
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
        isFirstLoad = false;
    } catch (error) {
        console.error('❌ Ошибка загрузки сообщений:', error);
        messagesDiv.innerHTML = '<div style="color:red;text-align:center;padding:20px;">Ошибка загрузки</div>';
    }
}

// ============ ОТПРАВКА ============
async function sendMessage() {
    if (!currentChatId) {
        alert('Выберите чат');
        return;
    }
    const text = msgInput.value.trim();
    if (!text) return;
    
    try {
        const resp = await fetch(`/api/send?user_id=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: currentChatId,
                chat_type: currentChatType || 'private',
                text: text
            })
        });
        const data = await resp.json();
        if (resp.ok) {
            msgInput.value = '';
            loadMessages(currentChatId);
            lastChatsData = '';
            setTimeout(() => loadChats(), 500);
        } else {
            alert('Ошибка отправки: ' + data.error);
        }
    } catch (error) {
        console.error('❌ Ошибка отправки:', error);
        alert('Ошибка соединения');
    }
}

// ============ ФАЙЛЫ ============
attachBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async function() {
    if (!currentChatId) {
        alert('Выберите чат');
        this.value = '';
        return;
    }
    const files = this.files;
    if (!files.length) return;
    
    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('chat_id', currentChatId);
        formData.append('chat_type', currentChatType || 'private');
        
        try {
            const resp = await fetch(`/api/upload?user_id=${userId}`, {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                loadMessages(currentChatId);
                lastChatsData = '';
                setTimeout(() => loadChats(), 500);
            } else {
                const data = await resp.json();
                alert('Ошибка загрузки: ' + data.error);
            }
        } catch (error) {
            console.error('Ошибка загрузки файла:', error);
            alert('Ошибка соединения');
        }
    }
    this.value = '';
});

// ============ ГОЛОСОВЫЕ ============
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

recordBtn.addEventListener('mousedown', startRecording);
recordBtn.addEventListener('mouseup', stopRecording);
recordBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(); });
recordBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopRecording(); });

async function startRecording() {
    if (!currentChatId) {
        alert('Выберите чат');
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const file = new File([audioBlob], 'voice.webm', { type: 'audio/webm' });
            const formData = new FormData();
            formData.append('file', file);
            formData.append('chat_id', currentChatId);
            formData.append('chat_type', currentChatType || 'private');
            
            try {
                const resp = await fetch(`/api/upload?user_id=${userId}`, {
                    method: 'POST',
                    body: formData
                });
                if (resp.ok) {
                    loadMessages(currentChatId);
                    lastChatsData = '';
                    setTimeout(() => loadChats(), 500);
                }
            } catch (error) {
                console.error('Ошибка отправки голосового:', error);
            }
            
            stream.getTracks().forEach(track => track.stop());
            isRecording = false;
            recordBtn.classList.remove('recording');
            recordBtn.textContent = '🎤';
        };
        mediaRecorder.start();
        isRecording = true;
        recordBtn.classList.add('recording');
        recordBtn.textContent = '⏺';
    } catch (error) {
        console.error('Ошибка записи:', error);
        alert('Нет доступа к микрофону');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive' && isRecording) {
        mediaRecorder.stop();
    }
}

// ============ ПОИСК ============
searchInput.addEventListener('input', async function() {
    const query = this.value.trim();
    if (query.length < 1) {
        searchResults.style.display = 'none';
        return;
    }
    
    try {
        const resp = await fetch(`/api/users?user_id=${userId}&search=${encodeURIComponent(query)}`);
        const users = await resp.json();
        
        if (users.length === 0) {
            searchResults.innerHTML = '<div class="result-item">Ничего не найдено</div>';
        } else {
            searchResults.innerHTML = users.map(u => `
                <div class="result-item" onclick="startPrivateChat(${u.id}, '${u.username}')">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div class="chat-avatar" style="width:30px;height:30px;font-size:14px;">${getAvatarHtml(u.avatar, u.display_name || u.username)}</div>
                        <div><strong>${u.display_name || u.username}</strong><br><span style="font-size:12px;color:#868e96;">@${u.username}</span></div>
                    </div>
                </div>
            `).join('');
        }
        searchResults.style.display = 'block';
    } catch (error) {
        console.error('Ошибка поиска:', error);
    }
});

document.addEventListener('click', function(e) {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
        searchResults.style.display = 'none';
    }
});

// ============ НАЧАТЬ ЛИЧНЫЙ ЧАТ ============
async function startPrivateChat(otherUserId, username) {
    const chatId = 'user_' + otherUserId;
    openChat('private', chatId, username, otherUserId);
    searchResults.style.display = 'none';
    searchInput.value = '';
    await loadChats();
}

// ============ ГРУППЫ ============
async function showCreateGroup() {
    document.getElementById('group-modal').style.display = 'flex';
    try {
        const resp = await fetch(`/api/users?user_id=${userId}&search=`);
        const users = await resp.json();
        document.getElementById('group-members-list').innerHTML = users.map(u => `
            <div style="padding:5px 0;display:flex;align-items:center;gap:10px;">
                <input type="checkbox" value="${u.id}" id="user_${u.id}">
                <label for="user_${u.id}">${u.display_name || u.username}</label>
            </div>
        `).join('');
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
    }
}

async function createGroup() {
    const name = document.getElementById('group-name').value.trim();
    if (!name) {
        alert('Введите название группы');
        return;
    }
    const checkboxes = document.querySelectorAll('#group-members-list input:checked');
    const members = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    try {
        const resp = await fetch(`/api/create_group?user_id=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, members })
        });
        const data = await resp.json();
        closeModal();
        lastChatsData = '';
        await loadChats();
        openChat('group', 'group_' + data.group_id, data.group_name, null, data.group_id);
    } catch (error) {
        console.error('Ошибка создания группы:', error);
    }
}

function closeModal() {
    document.getElementById('group-modal').style.display = 'none';
    document.getElementById('group-name').value = '';
}

// ============ ПРОСМОТР ГРУППЫ ============
async function showGroupInfo() {
    if (!currentGroupId) {
        alert('Это не группа');
        return;
    }
    
    const modal = document.getElementById('profile-modal');
    const content = document.getElementById('profile-content');
    const title = document.getElementById('profile-title');
    title.textContent = 'Информация о группе';
    modal.style.display = 'flex';
    
    try {
        const resp = await fetch(`/api/group/${currentGroupId}?user_id=${userId}&t=${Date.now()}`);
        if (!resp.ok) {
            content.innerHTML = '<div style="color:red;">Ошибка загрузки группы</div>';
            return;
        }
        const group = await resp.json();
        
        let membersHtml = group.members.map(m => `
            <div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid #f1f3f5;">
                <div class="chat-avatar" style="width:30px;height:30px;font-size:12px;">${getAvatarHtml(m.avatar, m.display_name || m.username)}</div>
                <div>
                    <div style="font-weight:500;">${m.display_name || m.username}</div>
                    ${m.id === group.created_by ? '<div style="font-size:11px;color:#007AFF;">Администратор</div>' : ''}
                </div>
            </div>
        `).join('');
        
        content.innerHTML = `
            <div style="text-align:center;margin-bottom:20px;">
                <div class="avatar-preview" style="width:80px;height:80px;border-radius:50%;margin:0 auto 15px;display:flex;align-items:center;justify-content:center;background:#007AFF;color:white;font-size:32px;overflow:hidden;">
                    👥
                </div>
                <h3>${group.name}</h3>
                <div style="color:#868e96;font-size:14px;">Создатель: ${group.creator_display_name || group.creator_username}</div>
                <div style="color:#999;font-size:12px;margin-top:5px;">Участников: ${group.members.length}</div>
            </div>
            <div style="margin-top:15px;">
                <div style="font-weight:500;margin-bottom:10px;">Участники:</div>
                ${membersHtml}
            </div>
            ${group.created_by == userId ? `
                <div style="margin-top:15px;">
                    <button onclick="showAddMembers()" style="width:100%;padding:10px;background:#007AFF;color:white;border:none;border-radius:10px;cursor:pointer;">Добавить участников</button>
                </div>
            ` : `
                <div style="margin-top:15px;">
                    <button onclick="leaveGroup()" style="width:100%;padding:10px;background:#dc3545;color:white;border:none;border-radius:10px;cursor:pointer;">Покинуть группу</button>
                </div>
            `}
        `;
    } catch (error) {
        content.innerHTML = '<div style="color:red;">Ошибка загрузки группы</div>';
    }
}

async function showAddMembers() {
    const content = document.getElementById('profile-content');
    try {
        const resp = await fetch(`/api/users?user_id=${userId}&search=`);
        const users = await resp.json();
        
        content.innerHTML = `
            <h3>Добавить участников</h3>
            <div style="max-height:200px;overflow-y:auto;margin:10px 0;">
                ${users.map(u => `
                    <div style="padding:5px 0;display:flex;align-items:center;gap:10px;">
                        <input type="checkbox" value="${u.id}" id="add_user_${u.id}">
                        <label for="add_user_${u.id}">${u.display_name || u.username}</label>
                    </div>
                `).join('')}
            </div>
            <button onclick="confirmAddMembers()" style="width:100%;padding:10px;background:#007AFF;color:white;border:none;border-radius:10px;cursor:pointer;">Добавить</button>
            <button onclick="showGroupInfo()" style="width:100%;padding:10px;background:#eee;border:none;border-radius:10px;cursor:pointer;margin-top:5px;">Назад</button>
        `;
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
    }
}

async function confirmAddMembers() {
    const checkboxes = document.querySelectorAll('#profile-content input[type="checkbox"]:checked');
    const members = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (members.length === 0) {
        alert('Выберите хотя бы одного пользователя');
        return;
    }
    
    try {
        const resp = await fetch(`/api/group/${currentGroupId}/add_members?user_id=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ members })
        });
        if (resp.ok) {
            alert('Участники добавлены!');
            showGroupInfo();
            loadChats();
        } else {
            const data = await resp.json();
            alert(data.error || 'Ошибка добавления');
        }
    } catch (error) {
        console.error('Ошибка добавления участников:', error);
    }
}

async function leaveGroup() {
    if (!confirm('Вы уверены, что хотите покинуть группу?')) return;
    
    try {
        const resp = await fetch(`/api/group/${currentGroupId}/leave?user_id=${userId}`, {
            method: 'POST'
        });
        if (resp.ok) {
            alert('Вы покинули группу');
            closeProfile();
            loadChats();
            // Закрываем чат, если он открыт
            if (currentChatId && currentChatId.startsWith('group_')) {
                currentChatId = null;
                currentGroupId = null;
                currentChatNameSpan.textContent = 'Выберите чат';
                messagesDiv.innerHTML = '';
            }
        } else {
            const data = await resp.json();
            alert(data.error || 'Ошибка');
        }
    } catch (error) {
        console.error('Ошибка выхода из группы:', error);
    }
}

// ============ ПРОФИЛЬ ============
async function showProfile() {
    const modal = document.getElementById('profile-modal');
    const content = document.getElementById('profile-content');
    const title = document.getElementById('profile-title');
    title.textContent = 'Мой профиль';
    modal.style.display = 'flex';
    
    try {
        const resp = await fetch(`/api/profile/${userId}?user_id=${userId}&t=${Date.now()}`);
        const user = await resp.json();
        
        content.innerHTML = `
            <div style="text-align:center;margin-bottom:20px;">
                <div class="avatar-preview" onclick="document.getElementById('avatar-input').click()" style="width:80px;height:80px;border-radius:50%;margin:0 auto 15px;display:flex;align-items:center;justify-content:center;background:#007AFF;color:white;font-size:32px;overflow:hidden;cursor:pointer;">
                    ${getAvatarHtml(user.avatar, user.display_name || user.username)}
                </div>
                <input type="file" id="avatar-input" style="display:none" accept="image/png,image/jpeg,image/gif,image/webp" onchange="uploadAvatar(this.files[0])">
                <div style="font-size:12px;color:#999;">Нажми на аватар, чтобы изменить</div>
            </div>
            <div>
                <label style="font-weight:500;display:block;margin-bottom:5px;">Имя</label>
                <input type="text" id="profile-name" value="${user.display_name || ''}" style="width:100%;padding:10px;margin:10px 0;border:1px solid #ddd;border-radius:10px;">
            </div>
            <div>
                <label style="font-weight:500;display:block;margin-bottom:5px;">О себе</label>
                <textarea id="profile-bio" style="width:100%;padding:10px;margin:10px 0;border:1px solid #ddd;border-radius:10px;resize:vertical;min-height:60px;">${user.bio || ''}</textarea>
            </div>
            <button onclick="saveProfile()" style="width:100%;padding:10px;background:#007AFF;color:white;border:none;border-radius:10px;cursor:pointer;margin-top:10px;">Сохранить</button>
        `;
    } catch (error) {
        content.innerHTML = '<div style="color:red;">Ошибка загрузки профиля</div>';
    }
}

async function showUserProfile(userIdToShow) {
    if (!userIdToShow) {
        alert('Выберите чат');
        return;
    }
    const modal = document.getElementById('profile-modal');
    const content = document.getElementById('profile-content');
    const title = document.getElementById('profile-title');
    title.textContent = 'Профиль пользователя';
    modal.style.display = 'flex';
    
    try {
        const resp = await fetch(`/api/profile/${userIdToShow}?user_id=${userId}&t=${Date.now()}`);
        if (!resp.ok) {
            content.innerHTML = '<div style="color:red;">Пользователь не найден</div>';
            return;
        }
        const user = await resp.json();
        
        content.innerHTML = `
            <div style="text-align:center;margin-bottom:20px;">
                <div class="avatar-preview" style="width:80px;height:80px;border-radius:50%;margin:0 auto 15px;display:flex;align-items:center;justify-content:center;background:#007AFF;color:white;font-size:32px;overflow:hidden;">
                    ${getAvatarHtml(user.avatar, user.display_name || user.username)}
                </div>
                <h3>${user.display_name || user.username}</h3>
                <div style="color:#868e96;font-size:14px;">@${user.username}</div>
                <div style="margin-top:10px;color:#495057;">${user.bio || 'Пока ничего о себе не рассказал'}</div>
            </div>
        `;
    } catch (error) {
        content.innerHTML = '<div style="color:red;">Ошибка загрузки профиля</div>';
    }
}

async function uploadAvatar(file) {
    if (!file) return;
    const formData = new FormData();
    formData.append('avatar', file);
    
    try {
        const resp = await fetch(`/api/upload_avatar?user_id=${userId}`, {
            method: 'POST',
            body: formData
        });
        const data = await resp.json();
        if (resp.ok) {
            alert('Аватар обновлён!');
            lastChatsData = '';
            await loadChats();
            if (currentChatUserId) {
                await updateChatHeaderAvatar(currentChatUserId);
            }
            closeProfile();
        } else {
            alert(data.error || 'Ошибка загрузки');
        }
    } catch (error) {
        console.error('Ошибка загрузки аватара:', error);
        alert('Ошибка загрузки');
    }
}

async function saveProfile() {
    const name = document.getElementById('profile-name').value.trim();
    const bio = document.getElementById('profile-bio').value.trim();
    
    try {
        const resp = await fetch(`/api/update_profile?user_id=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ display_name: name, bio })
        });
        if (resp.ok) {
            alert('Профиль обновлён!');
            closeProfile();
            lastChatsData = '';
            loadChats();
        }
    } catch (error) {
        console.error('Ошибка сохранения:', error);
    }
}

function closeProfile() {
    document.getElementById('profile-modal').style.display = 'none';
}

// ============ ВЫХОД ============
async function logout() {
    if (confirm('Выйти?')) {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
    }
}

// ============ ОБРАБОТЧИКИ ============
sendBtn.addEventListener('click', sendMessage);
msgInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') sendMessage();
});

// ============ АВТООБНОВЛЕНИЕ ============
setInterval(function() {
    if (currentChatId) {
        loadMessages(currentChatId);
    }
}, 3000);

setInterval(function() {
    loadChats();
}, 10000);

// ============ ЗАПУСК ============
console.log('🚀 Запуск Nexus, userId:', userId);
loadChats();