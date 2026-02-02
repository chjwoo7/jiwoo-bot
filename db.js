import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'jiwoo_bot',
    user: process.env.DB_USER || 'jiwoo',
    password: process.env.DB_PASSWORD,
});

// Test connection
pool.on('connect', () => {
    console.log('[DB] Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('[DB] Unexpected error on idle client', err);
    process.exit(-1);
});

export default pool;
