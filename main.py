from flask import Flask, render_template, request, jsonify, session, send_from_directory
import sqlite3
import hashlib
import secrets
import os
from datetime import datetime
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)

# Настройки загрузки файлов
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'webm', 'pdf', 'doc', 'docx', 'txt', 'zip', 'mp3', 'wav', 'ogg'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB

# Создаем папку для загрузок
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def get_db():
    conn = sqlite3.connect('database/data_source.db')
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    if 'user_id' not in session:
        return render_template('login.html')
    return render_template('chat.html', user_id=session['user_id'], username=session['username'])

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# ============ АВТОРИЗАЦИЯ ============

@app.route('/api/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        display_name = data.get('display_name', username)
        
        db = get_db()
        existing = db.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone()
        if existing:
            db.close()
            return jsonify({'error': 'Ник уже занят'}), 400
        
        hashed = hash_password(password)
        db.execute(
            'INSERT INTO users (username, password, display_name) VALUES (?, ?, ?)',
            (username, hashed, display_name)
        )
        db.commit()
        db.close()
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')
        
        db = get_db()
        user = db.execute(
            'SELECT * FROM users WHERE username = ? AND password = ?',
            (username, hash_password(password))
        ).fetchone()
        db.close()
        
        if not user:
            return jsonify({'error': 'Неверный логин или пароль'}), 401
        
        session['user_id'] = user['id']
        session['username'] = user['username']
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'status': 'ok'})

# ============ ПОИСК ПОЛЬЗОВАТЕЛЕЙ ============

@app.route('/api/users', methods=['GET'])
def get_users():
    try:
        if 'user_id' not in session:
            return jsonify({'error': 'Не авторизован'}), 401
        
        search = request.args.get('search', '')
        db = get_db()
        users = db.execute(
            '''SELECT id, username, display_name, bio, avatar 
               FROM users 
               WHERE (username LIKE ? OR display_name LIKE ?) AND id != ?''',
            (f'%{search}%', f'%{search}%', session['user_id'])
        ).fetchall()
        db.close()
        return jsonify([dict(u) for u in users])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============ ПРОФИЛИ ============

@app.route('/api/profile/<int:user_id>', methods=['GET'])
def get_profile(user_id):
    try:
        if 'user_id' not in session:
            return jsonify({'error': 'Не авторизован'}), 401
        
        db = get_db()
        user = db.execute(
            'SELECT id, username, display_name, bio, avatar FROM users WHERE id = ?',
            (user_id,)
        ).fetchone()
        db.close()
        
        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404
        
        return jsonify(dict(user))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/update_profile', methods=['POST'])
def update_profile():
    try:
        if 'user_id' not in session:
            return jsonify({'error': 'Не авторизован'}), 401
        
        data = request.get_json()
        display_name = data.get('display_name')
        bio = data.get('bio')
        
        db = get_db()
        db.execute(
            'UPDATE users SET display_name = ?, bio = ? WHERE id = ?',
            (display_name, bio, session['user_id'])
        )
        db.commit()
        db.close()
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload_avatar', methods=['POST'])
def upload_avatar():
    try:
        if 'user_id' not in session:
            return jsonify({'error': 'Не авторизован'}), 401
        
        if 'avatar' not in request.files:
            return jsonify({'error': 'Нет файла'}), 400
        
        file = request.files['avatar']
        if file.filename == '':
            return jsonify({'error': 'Файл не выбран'}), 400
        
        allowed = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
        ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
        if ext not in allowed:
            return jsonify({'error': 'Недопустимый формат. Используйте PNG, JPG, GIF или WEBP'}), 400
        
        filename = secure_filename(file.filename)
        unique_name = f"avatar_{session['user_id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{ext}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_name)
        file.save(filepath)
        
        db = get_db()
        db.execute(
            'UPDATE users SET avatar = ? WHERE id = ?',
            (f"/uploads/{unique_name}", session['user_id'])
        )
        db.commit()
        db.close()
        
        return jsonify({'status': 'ok', 'avatar': f"/uploads/{unique_name}"})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============ СООБЩЕНИЯ ============

@app.route('/api/send', methods=['POST'])
def send_message():
    try:
        if 'user_id' not in session:
            return jsonify({'error': 'Не авторизован'}), 401
        
        data = request.get_json()
        
        # ===== ЛОГИ ДЛЯ ОТЛАДКИ =====
        print("=" * 50)
        print("📨 ПРИШЛО СООБЩЕНИЕ:")
        print("  chat_id:", data.get('chat_id'))
        print("  chat_type:", data.get('chat_type'))
        print("  text:", data.get('text'))
        print("  sender_id:", session['user_id'])
        print("  Полные данные:", data)
        print("=" * 50)
        # ============================
        
        chat_id = data.get('chat_id')
        chat_type = data.get('chat_type', 'private')
        text = data.get('text', '')
        
        # Проверяем, что chat_id передан
        if not chat_id:
            print("❌ ОШИБКА: chat_id не передан!")
            return jsonify({'error': 'chat_id обязателен'}), 400
        
        # Проверяем, что chat_id не равен 'undefined'
        if chat_id == 'undefined':
            print("❌ ОШИБКА: chat_id = 'undefined'!")
            return jsonify({'error': 'chat_id не может быть undefined'}), 400
        
        db = get_db()
        db.execute(
            'INSERT INTO messages (sender_id, chat_id, chat_type, text) VALUES (?, ?, ?, ?)',
            (session['user_id'], chat_id, chat_type, text)
        )
        db.commit()
        db.close()
        
        print("✅ Сообщение сохранено в БД")
        return jsonify({'status': 'ok'})
    except Exception as e:
        print("❌ ОШИБКА В SEND_MESSAGE:", str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/messages/<chat_id>', methods=['GET'])
def get_messages(chat_id):
    try:
        if 'user_id' not in session:
            return jsonify({'error': 'Не авторизован'}), 401
        
        print(f"📨 Запрос сообщений для чата: {chat_id}")
        
        db = get_db()
        messages = db.execute('''
            SELECT m.*, u.username, u.display_name, u.avatar
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.chat_id = ?
            ORDER BY m.timestamp ASC
        ''', (chat_id,)).fetchall()
        db.close()
        
        print(f"✅ Найдено сообщений: {len(messages)}")
        return jsonify([dict(m) for m in messages])
    except Exception as e:
        print("❌ ОШИБКА В GET_MESSAGES:", str(e))
        return jsonify({'error': str(e)}), 500

# ============ ЗАГРУЗКА ФАЙЛОВ ============

@app.route('/api/upload', methods=['POST'])
def upload_file():
    try:
        if 'user_id' not in session:
            return jsonify({'error': 'Не авторизован'}), 401
        
        if 'file' not in request.files:
            return jsonify({'error': 'Нет файла'}), 400
        
        file = request.files['file']
        chat_id = request.form.get('chat_id')
        chat_type = request.form.get('chat_type', 'private')
        
        print(f"📎 Загрузка файла: {file.filename}, chat_id: {chat_id}")
        
        if file.filename == '':
            return jsonify({'error': 'Файл не выбран'}), 400
        
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            unique_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{filename}"
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_name)
            file.save(filepath)
            
            db = get_db()
            db.execute(
                'INSERT INTO messages (sender_id, chat_id, chat_type, text, file_path) VALUES (?, ?, ?, ?, ?)',
                (session['user_id'], chat_id, chat_type, f"/uploads/{unique_name}", f"/uploads/{unique_name}")
            )
            db.commit()
            db.close()
            
            return jsonify({'status': 'ok', 'filepath': f"/uploads/{unique_name}"})
        
        return jsonify({'error': 'Недопустимый тип файла'}), 400
    except Exception as e:
        print("❌ ОШИБКА В UPLOAD:", str(e))
        return jsonify({'error': str(e)}), 500

# ============ ЧАТЫ ============

@app.route('/api/chats', methods=['GET'])
def get_chats():
    try:
        if 'user_id' not in session:
            return jsonify({'error': 'Не авторизован'}), 401
        
        user_id = session['user_id']
        db = get_db()
        
        private_chats = db.execute('''
            SELECT DISTINCT 
                CASE 
                    WHEN sender_id = ? THEN (
                        SELECT id FROM users WHERE id != ? AND id IN (
                            SELECT sender_id FROM messages WHERE chat_type = 'private' AND sender_id != ?
                        )
                    )
                    ELSE sender_id
                END as user_id
            FROM messages 
            WHERE chat_type = 'private' AND (sender_id = ? OR sender_id IN (
                SELECT sender_id FROM messages WHERE chat_type = 'private'
            ))
        ''', (user_id, user_id, user_id, user_id)).fetchall()
        
        private_result = []
        for row in private_chats:
            if row['user_id']:
                user = db.execute(
                    'SELECT id, username, display_name, avatar FROM users WHERE id = ?',
                    (row['user_id'],)
                ).fetchone()
                if user:
                    private_result.append(user)
        
        groups = db.execute('''
            SELECT g.id, g.name, g.created_by, u.username as creator
            FROM groups g
            JOIN group_members gm ON g.id = gm.group_id
            JOIN users u ON g.created_by = u.id
            WHERE gm.user_id = ?
        ''', (user_id,)).fetchall()
        
        db.close()
        return jsonify({
            'private': [dict(p) for p in private_result],
            'groups': [dict(g) for g in groups]
        })
    except Exception as e:
        print("❌ ОШИБКА В GET_CHATS:", str(e))
        return jsonify({'error': str(e)}), 500

# ============ ГРУППЫ ============

@app.route('/api/create_group', methods=['POST'])
def create_group():
    try:
        if 'user_id' not in session:
            return jsonify({'error': 'Не авторизован'}), 401
        
        data = request.get_json()
        group_name = data.get('name')
        member_ids = data.get('members', [])
        
        db = get_db()
        cursor = db.execute(
            'INSERT INTO groups (name, created_by) VALUES (?, ?)',
            (group_name, session['user_id'])
        )
        group_id = cursor.lastrowid
        
        db.execute(
            'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
            (group_id, session['user_id'])
        )
        for user_id in member_ids:
            db.execute(
                'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
                (group_id, user_id)
            )
        db.commit()
        db.close()
        return jsonify({'group_id': group_id, 'group_name': group_name})
    except Exception as e:
        print("❌ ОШИБКА В CREATE_GROUP:", str(e))
        return jsonify({'error': str(e)}), 500

# ============ ЗАПУСК ============

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)