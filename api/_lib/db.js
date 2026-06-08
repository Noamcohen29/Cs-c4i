import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

// ── Registration ──────────────────────────────────────────────────────────────

export async function getApprovedUser(phone) {
  try {
    const r = await sql`
      SELECT phone, name, role FROM users_isfield
      WHERE phone = ${phone} AND manager_approved = true AND name IS NOT NULL
      LIMIT 1`;
    return r[0] ?? null;
  } catch { return null; }
}

export async function getFieldUser(phone) {
  try {
    const r = await sql`
      SELECT phone, name, manager_approved FROM users_isfield
      WHERE phone = ${phone} LIMIT 1`;
    return r[0] ?? null;
  } catch { return null; }
}

export async function createAnonymousUser(phone) {
  try {
    await sql`
      INSERT INTO users_isfield (phone, name, role, manager_approved)
      VALUES (${phone}, NULL, 'TECH', false)
      ON CONFLICT (phone) DO NOTHING`;
  } catch (e) { console.error('createAnonymousUser:', e.message); }
}

export async function setUserName(phone, name) {
  try {
    await sql`UPDATE users_isfield SET name = ${name} WHERE phone = ${phone}`;
  } catch (e) { console.error('setUserName:', e.message); }
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function getSession(phone) {
  try {
    const r = await sql`SELECT state FROM sessions WHERE phone = ${phone} LIMIT 1`;
    return r[0]?.state ?? 'IDLE';
  } catch { return 'IDLE'; }
}

export async function setSession(phone, state) {
  try {
    await sql`
      INSERT INTO sessions (phone, state, updated_at)
      VALUES (${phone}, ${state}, CURRENT_TIMESTAMP)
      ON CONFLICT (phone) DO UPDATE
      SET state = EXCLUDED.state, updated_at = CURRENT_TIMESTAMP`;
  } catch (e) { console.error('setSession:', e.message); }
}

// ── Users list ────────────────────────────────────────────────────────────────

export async function getApprovedUsers() {
  try {
    const r = await sql`
      SELECT phone, name, role FROM users_isfield
      WHERE manager_approved = true AND name IS NOT NULL
      ORDER BY name`;
    return r;
  } catch { return []; }
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function createTask({ task_date, topic, client_name, client_phone, description, manager_phone, tech_phones, created_by }) {
  try {
    const r = await sql`
      INSERT INTO tasks (task_date, topic, client_name, client_phone, description, manager_phone, tech_phones, created_by)
      VALUES (${task_date}, ${topic}, ${client_name}, ${client_phone}, ${description}, ${manager_phone}, ${tech_phones}, ${created_by})
      RETURNING task_id`;
    return r[0]?.task_id ?? null;
  } catch (e) { console.error('createTask:', e.message); return null; }
}
