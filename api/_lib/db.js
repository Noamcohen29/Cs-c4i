import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

// Returns user if approved (manager_approved = true AND name is set)
export async function getApprovedUser(phone) {
  try {
    const result = await sql`
      SELECT phone, name FROM users_isfield
      WHERE phone = ${phone} AND manager_approved = true AND name IS NOT NULL
      LIMIT 1
    `;
    return result.length > 0 ? result[0] : null;
  } catch (error) { return null; }
}

// Returns row from users_isfield regardless of approval
export async function getFieldUser(phone) {
  try {
    const result = await sql`
      SELECT phone, name, manager_approved FROM users_isfield
      WHERE phone = ${phone}
      LIMIT 1
    `;
    return result.length > 0 ? result[0] : null;
  } catch (error) { return null; }
}

// First contact: insert phone with no name yet
export async function createAnonymousUser(phone) {
  try {
    await sql`
      INSERT INTO users_isfield (phone, name, role, manager_approved)
      VALUES (${phone}, NULL, 'TECH', false)
      ON CONFLICT (phone) DO NOTHING
    `;
  } catch (error) { console.error('createAnonymousUser error:', error.message); }
}

// Second step: fill in the name
export async function setUserName(phone, name) {
  try {
    await sql`
      UPDATE users_isfield SET name = ${name} WHERE phone = ${phone}
    `;
  } catch (error) { console.error('setUserName error:', error.message); }
}
