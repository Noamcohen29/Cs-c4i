import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

export async function getApprovedUser(phone) {
  try {
    const result = await sql`
      SELECT phone, name FROM users_isfield
      WHERE phone = ${phone} AND manager_approved = true
      LIMIT 1
    `;
    return result.length > 0 ? result[0] : null;
  } catch (error) { return null; }
}

export async function getPendingUser(phone) {
  try {
    const result = await sql`
      SELECT phone, name, manager_approved FROM users_isfield
      WHERE phone = ${phone}
      LIMIT 1
    `;
    return result.length > 0 ? result[0] : null;
  } catch (error) { return null; }
}

export async function registerUser(phone, name) {
  try {
    await sql`
      INSERT INTO users_isfield (phone, name, role, manager_approved)
      VALUES (${phone}, ${name}, 'TECH', false)
      ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
    `;
  } catch (error) {
    console.error('registerUser error:', error.message);
  }
}

export async function getSession(phone) {
  try {
    const result = await sql`
      SELECT current_state FROM User_Sessions WHERE phone = ${phone} LIMIT 1
    `;
    return result.length > 0 ? result[0].current_state : 'IDLE';
  } catch (error) { return 'IDLE'; }
}

export async function setSession(phone, state) {
  try {
    await sql`
      INSERT INTO User_Sessions (phone, current_state, last_updated)
      VALUES (${phone}, ${state}, CURRENT_TIMESTAMP)
      ON CONFLICT (phone) DO UPDATE
      SET current_state = EXCLUDED.current_state, last_updated = CURRENT_TIMESTAMP
    `;
  } catch (error) {}
}
