from flask import Flask, render_template, request, jsonify, session
import sqlite3
import hashlib
import secrets
from datetime import datetime

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)

def get_db():
    conn = sqlite3.connect('database/data_source.db')
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

@app.route('/')
def index():
    if 'user_id' not in session:
        return render_template('login.html')
    return render_template('chat.html', user_id=session['user_id'], username=session['username'])

@app.route('/api/register', methods=['POST'])
def register():
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

@app.route('/api/login', methods=['POST'])
def login():
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

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'status': 'ok'})

@app.route('/api/users', methods=['GET'])
def get_users():
    if 'user_id' not in session:
        return jsonify({'error': 'Не авторизован'}), 401
    
    search = request.args.get('search', '')
    db = get_db()
    users = db.execute(
        'SELECT id, username, display_name FROM users WHERE username LIKE ? AND id != ?',
        (f'%{search}%', session['user_id'])
    ).fetchall()
    db.close()
    return jsonify([dict(u) for u in users])

@app.route('/api/send', methods=['POST'])
def send_message():
    if 'user_id' not in session:
        return jsonify({'error': 'Не авторизован'}), 401
    
    data = request.get_json()
    chat_id = data.get('chat_id')
    chat_type = data.get('chat_type')
    text = data.get('text')
    
    db = get_db()
    db.execute(
        'INSERT INTO messages (sender_id, chat_id, chat_type, text) VALUES (?, ?, ?, ?)',
        (session['user_id'], chat_id, chat_type, text)
    )
    db.commit()
    db.close()
    return jsonify({'status': 'ok'})

@app.route('/api/messages/<chat_id>', methods=['GET'])
def get_messages(chat_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Не авторизован'}), 401
    
    db = get_db()
    messages = db.execute('''
        SELECT m.*, u.username, u.display_name 
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.chat_id = ?
        ORDER BY m.timestamp ASC
    ''', (chat_id,)).fetchall()
    db.close()
    return jsonify([dict(m) for m in messages])

@app.route('/api/create_group', methods=['POST'])
def create_group():
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

@app.route('/api/chats', methods=['GET'])
def get_chats():
    if 'user_id' not in session:
        return jsonify({'error': 'Не авторизован'}), 401
    
    user_id = session['user_id']
    db = get_db()
    
    private_chats = db.execute('''
        SELECT DISTINCT 
            CASE 
                WHEN m.sender_id = ? THEN u2.id
                ELSE u1.id
            END as user_id,
            u.username,
            u.display_name
        FROM messages m
        JOIN users u1 ON m.sender_id = u1.id
        JOIN users u2 ON m.sender_id = u2.id
        WHERE m.chat_type = 'private' 
        AND (m.sender_id = ? OR m.sender_id IN (
            SELECT sender_id FROM messages WHERE chat_type = 'private'
        ))
    ''', (user_id, user_id)).fetchall()
    
    groups = db.execute('''
        SELECT g.id, g.name, g.created_by, u.username as creator
        FROM groups g
        JOIN group_members gm ON g.id = gm.group_id
        JOIN users u ON g.created_by = u.id
        WHERE gm.user_id = ?
    ''', (user_id,)).fetchall()
    
    db.close()
    return jsonify({
        'private': [dict(p) for p in private_chats],
        'groups': [dict(g) for g in groups]
    })

@app.route('/api/update_display_name', methods=['POST'])
def update_display_name():
    if 'user_id' not in session:
        return jsonify({'error': 'Не авторизован'}), 401
    
    data = request.get_json()
    new_name = data.get('display_name')
    
    db = get_db()
    db.execute(
        'UPDATE users SET display_name = ? WHERE id = ?',
        (new_name, session['user_id'])
    )
    db.commit()
    db.close()
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)