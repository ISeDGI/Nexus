from flask import Flask, render_template, request, jsonify
import sqlite3
from datetime import datetime

app = Flask(__name__)

# Подключение к базе данных
def get_db():
    conn = sqlite3.connect('database/data_source.db')
    conn.row_factory = sqlite3.Row
    return conn

# Главная страница (чат)
@app.route('/')
def index():
    return render_template('index.html')

# Получить все сообщения
@app.route('/api/messages')
def get_messages():
    db = get_db()
    messages = db.execute('SELECT * FROM messages ORDER BY timestamp ASC').fetchall()
    db.close()
    return jsonify([dict(msg) for msg in messages])

# Отправить сообщение
@app.route('/api/send', methods=['POST'])
def send_message():
    data = request.get_json()
    username = data.get('username', 'Аноним')
    text = data.get('text', '')
    
    if not text:
        return jsonify({'error': 'Пустое сообщение'}), 400
    
    db = get_db()
    db.execute('INSERT INTO messages (username, text) VALUES (?, ?)', (username, text))
    db.commit()
    db.close()
    
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)