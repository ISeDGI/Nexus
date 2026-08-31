import sqlite3
import json
from datetime import datetime

DB_NAME = 'nexus.db'

def get_db():
    """Подключение к БД"""
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Создание таблиц при первом запуске"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Таблица пользователей
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            avatar TEXT DEFAULT 'default.png',
            status TEXT DEFAULT 'online',
            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Таблица сообщений
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER,
            chat_id INTEGER,
            text TEXT,
            file_url TEXT,
            message_type TEXT DEFAULT 'text',
            status TEXT DEFAULT 'sending',
            is_read BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_id) REFERENCES users (id),
            FOREIGN KEY (receiver_id) REFERENCES users (id)
        )
    ''')
    
    # Таблица чатов (личные и групповые)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            type TEXT DEFAULT 'personal',
            avatar TEXT DEFAULT 'default.png',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Таблица участников чатов
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chat_members (
            chat_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (chat_id, user_id),
            FOREIGN KEY (chat_id) REFERENCES chats (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Таблица для хранения статусов прочтения
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS read_receipts (
            message_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (message_id, user_id),
            FOREIGN KEY (message_id) REFERENCES messages (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    conn.commit()
    conn.close()
    print("✅ База данных инициализирована")

# Функции для работы с сообщениями
def save_message(sender_id, receiver_id, text, chat_id=None):
    """Сохранить сообщение в БД"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Если нет chat_id, создаём личный чат
    if not chat_id:
        # Проверяем, существует ли уже чат между этими пользователями
        chat = cursor.execute('''
            SELECT c.id FROM chats c
            JOIN chat_members cm1 ON c.id = cm1.chat_id
            JOIN chat_members cm2 ON c.id = cm2.chat_id
            WHERE c.type = 'personal' 
            AND cm1.user_id = ? AND cm2.user_id = ?
        ''', (sender_id, receiver_id)).fetchone()
        
        if chat:
            chat_id = chat['id']
        else:
            # Создаём новый личный чат
            cursor.execute('INSERT INTO chats (type) VALUES (?)', ('personal',))
            chat_id = cursor.lastrowid
            cursor.execute('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)', (chat_id, sender_id))
            cursor.execute('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)', (chat_id, receiver_id))
    
    # Сохраняем сообщение
    cursor.execute('''
        INSERT INTO messages (sender_id, receiver_id, chat_id, text, status)
        VALUES (?, ?, ?, ?, ?)
    ''', (sender_id, receiver_id, chat_id, text, 'sent'))
    
    message_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return get_message_by_id(message_id)

def get_message_by_id(message_id):
    """Получить сообщение по ID"""
    conn = get_db()
    cursor = conn.cursor()
    msg = cursor.execute('''
        SELECT m.*, u1.username as sender_name, u2.username as receiver_name,
               (SELECT COUNT(*) FROM read_receipts WHERE message_id = m.id) as read_count
        FROM messages m
        LEFT JOIN users u1 ON m.sender_id = u1.id
        LEFT JOIN users u2 ON m.receiver_id = u2.id
        WHERE m.id = ?
    ''', (message_id,)).fetchone()
    conn.close()
    return dict(msg) if msg else None

def mark_as_read(message_id, user_id):
    """Отметить сообщение как прочитанное"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Добавляем запись о прочтении
    cursor.execute('''
        INSERT OR IGNORE INTO read_receipts (message_id, user_id)
        VALUES (?, ?)
    ''', (message_id, user_id))
    
    # Обновляем статус сообщения
    cursor.execute('''
        UPDATE messages SET is_read = 1, status = 'read'
        WHERE id = ?
    ''', (message_id,))
    
    conn.commit()
    conn.close()

def get_chat_messages(chat_id, limit=50):
    """Получить последние сообщения в чате"""
    conn = get_db()
    cursor = conn.cursor()
    messages = cursor.execute('''
        SELECT m.*, u.username as sender_name,
               (SELECT COUNT(*) FROM read_receipts WHERE message_id = m.id) as read_count
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE m.chat_id = ?
        ORDER BY m.created_at DESC LIMIT ?
    ''', (chat_id, limit)).fetchall()
    conn.close()
    return [dict(msg) for msg in messages]

def delete_message(message_id, user_id):
    """Удалить сообщение (только для владельца)"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Проверяем, что пользователь - владелец сообщения
    msg = cursor.execute('SELECT sender_id FROM messages WHERE id = ?', (message_id,)).fetchone()
    if msg and msg['sender_id'] == user_id:
        cursor.execute('DELETE FROM messages WHERE id = ?', (message_id,))
        cursor.execute('DELETE FROM read_receipts WHERE message_id = ?', (message_id,))
        conn.commit()
        conn.close()
        return True
    conn.close()
    return False

# Инициализация при первом запуске
if __name__ == '__main__':
    init_db()