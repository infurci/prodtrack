// ─────────────────────────────────────────────────────────
// One shared connection pool to PostgreSQL.
// Every part of the backend imports this so we reuse connections
// instead of opening a new one per request.
// ─────────────────────────────────────────────────────────
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 10,                 // up to 10 simultaneous connections
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

module.exports = pool;
