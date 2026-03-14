const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'data.sqlite');

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      provider_payment_id TEXT,
      pay_to_request_id TEXT,
      status TEXT NOT NULL,
      raw_response TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_payments_pay_to_request_id ON payments(pay_to_request_id)`);

  db.run('ALTER TABLE payments ADD COLUMN pay_to_request_id TEXT', (err) => {
    if (err && !/duplicate column/i.test(err.message)) console.error(err);
  });
});

module.exports = db;

