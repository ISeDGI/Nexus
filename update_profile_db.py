import sqlite3

conn = sqlite3.connect('database/data_source.db')
cursor = conn.cursor()

# Добавляем поле bio (о себе)
try:
    cursor.execute('ALTER TABLE users ADD COLUMN bio TEXT')
    print("✅ Добавлено поле bio")
except sqlite3.OperationalError:
    print("ℹ️ Поле bio уже существует")

# Добавляем поле avatar (аватар)
try:
    cursor.execute('ALTER TABLE users ADD COLUMN avatar TEXT')
    print("✅ Добавлено поле avatar")
except sqlite3.OperationalError:
    print("ℹ️ Поле avatar уже существует")

# Добавляем поле file_path в messages
try:
    cursor.execute('ALTER TABLE messages ADD COLUMN file_path TEXT')
    print("✅ Добавлено поле file_path в messages")
except sqlite3.OperationalError:
    print("ℹ️ Поле file_path уже существует")

conn.commit()
conn.close()
print("✅ База данных обновлена!")