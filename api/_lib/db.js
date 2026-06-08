import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const sql = neon(connectionString);

export async function getUserByPhone(phone) {
  try {
    const result = await sql`
      SELECT name, role, country, language, status, registration_type, employee_id
      FROM Users
      WHERE phone = ${phone}
      LIMIT 1
    `;
    if (result.length > 0) return result[0];

    // Check users_isfield for approved users
    const fieldResult = await sql`
      SELECT name,
             COALESCE(role, 'TECH') as role,
             COALESCE(country, '') as country,
             'he' as language,
             'ACTIVE' as status,
             'field' as registration_type,
             employee_id
      FROM users_isfield
      WHERE phone = ${phone} AND manager_approved = true
      LIMIT 1
    `;
    return fieldResult.length > 0 ? fieldResult[0] : null;
  } catch (error) { return null; }
}

export async function getPendingFieldUser(phone) {
  try {
    const result = await sql`
      SELECT phone, name, manager_approved, created_at
      FROM users_isfield
      WHERE phone = ${phone}
      LIMIT 1
    `;
    return result.length > 0 ? result[0] : null;
  } catch (error) { return null; }
}

export async function createPendingFieldUser(phone, name) {
  try {
    await sql`
      INSERT INTO users_isfield (phone, name, role, manager_approved)
      VALUES (${phone}, ${name}, 'TECH', false)
      ON CONFLICT (phone) DO UPDATE
      SET name = EXCLUDED.name
    `;
  } catch (error) {
    console.error('createPendingFieldUser error:', error.message);
  }
}

export async function getProjectManagerByCountry(country) {
  try {
    const result = await sql`SELECT pm_name, pm_email FROM project_managers WHERE country = ${country} LIMIT 1`;
    return result.length > 0 ? result[0] : null;
  } catch (error) { return null; }
}

export async function isSerialNumberValid(sn) {
  try {
    const result = await sql`SELECT 1 FROM product_serials WHERE serial_number = ${sn} LIMIT 1`;
    return result.length > 0;
  } catch (error) { return false; }
}

export async function getUserSessionState(phone) {
  try {
    const result = await sql`SELECT current_state FROM User_Sessions WHERE phone = ${phone} LIMIT 1`;
    return result.length > 0 ? result[0].current_state : 'IDLE';
  } catch (error) { return 'IDLE'; }
}

export async function setUserSession(phone, state) {
  try {
    await sql`
      INSERT INTO User_Sessions (phone, current_state, last_updated) 
      VALUES (${phone}, ${state}, CURRENT_TIMESTAMP)
      ON CONFLICT (phone) DO UPDATE 
      SET current_state = EXCLUDED.current_state, last_updated = CURRENT_TIMESTAMP
    `;
  } catch (error) {}
}

export async function createTicket(phone, description, serialPhotoUrls = null) {
  try {
    const result = await sql`
      INSERT INTO Tickets (phone, description, status, serial_photo_urls) 
      VALUES (${phone}, ${description}, 'OPEN', ${serialPhotoUrls})
      RETURNING ticket_id
    `;
    return result[0].ticket_id;
  } catch (error) {
    // Fallback: try without serial_photo_urls if column doesn't exist yet
    try {
      const result = await sql`
        INSERT INTO Tickets (phone, description, status) 
        VALUES (${phone}, ${description}, 'OPEN')
        RETURNING ticket_id
      `;
      return result[0].ticket_id;
    } catch (e) { return "ERROR"; }
  }
}

export async function createInvoiceSubmission(phone, userData, details, fileUrl = null) {
  try {
    await sql`
      INSERT INTO invoices (phone, employee_id, notes, file_url)
      VALUES (${phone}, ${userData?.employee_id || null}, ${details}, ${fileUrl})
    `;
  } catch (error) {
    console.error('Invoice insert error:', error.message);
  }
}

export async function createMissionStatusUpdate(phone, statusText) {
  try {
    await sql`
      INSERT INTO mission_status_updates (mission_id, phone, status, notes)
      VALUES ('UNKNOWN', ${phone}, 'RECEIVED', ${statusText})
    `;
  } catch (error) {
    console.error('Mission status insert error:', error.message);
  }
}

export async function getUserTickets(phone) {
  try {
    const result = await sql`SELECT ticket_id, description, status, serial_photo_urls, created_at FROM Tickets WHERE phone = ${phone} ORDER BY created_at DESC LIMIT 50`;
    return result;
  } catch (error) { return []; }
}

export async function getTicketsByIds(phone, ids) {
  try {
    const result = await sql`SELECT ticket_id, description, status, serial_photo_urls, created_at FROM Tickets WHERE phone = ${phone} AND ticket_id = ANY(${ids}::int[]) ORDER BY created_at DESC`;
    return result;
  } catch (error) { return []; }
}

export async function getEmployeeTasks(phone) {
  try {
    const result = await sql`SELECT task_id, title, description, status, due_date FROM tasks WHERE assigned_to_phone = ${phone} ORDER BY due_date ASC, task_id ASC`;
    return result;
  } catch (error) { return []; }
}

export async function getTaskWithReports(taskId, phone) {
  try {
    const tasks = await sql`SELECT task_id, title, description, status, due_date FROM tasks WHERE task_id = ${taskId} AND assigned_to_phone = ${phone} LIMIT 1`;
    if (tasks.length === 0) return null;
    const reports = await sql`SELECT report_text, new_status, created_at FROM task_reports WHERE task_id = ${taskId} ORDER BY created_at ASC`;
    return { ...tasks[0], reports };
  } catch (error) { return null; }
}

export async function createTaskReport(taskId, phone, reportText, newStatus, fileUrl = null) {
  try {
    await sql`INSERT INTO task_reports (task_id, phone, report_text, new_status, file_url) VALUES (${taskId}, ${phone}, ${reportText}, ${newStatus}, ${fileUrl})`;
    if (newStatus) {
      await sql`UPDATE tasks SET status = ${newStatus} WHERE task_id = ${taskId}`;
    }
  } catch (error) {
    // Fallback: column file_url may not exist yet
    try {
      await sql`INSERT INTO task_reports (task_id, phone, report_text, new_status) VALUES (${taskId}, ${phone}, ${reportText}, ${newStatus})`;
      if (newStatus) {
        await sql`UPDATE tasks SET status = ${newStatus} WHERE task_id = ${taskId}`;
      }
    } catch (e) { console.error('Task report error:', e.message); }
  }
}

export async function closeTicket(phone, ticketId) {
  try {
    await sql`UPDATE Tickets SET status = 'CLOSED' WHERE ticket_id = ${ticketId} AND phone = ${phone}`;
    return true;
  } catch (error) { return false; }
}

export async function reopenTicket(phone, ticketId) {
  try {
    await sql`UPDATE Tickets SET status = 'OPEN' WHERE ticket_id = ${ticketId} AND phone = ${phone}`;
    return true;
  } catch (error) { return false; }
}

export async function addTicketComment(phone, ticketId, comment) {
  try {
    const dateStr = new Date().toLocaleDateString('en-GB');
    const commentLine = `\n[Comment ${dateStr}]: ${comment}`;
    await sql`UPDATE Tickets SET description = description || ${commentLine} WHERE ticket_id = ${ticketId} AND phone = ${phone}`;
    return true;
  } catch (error) { return false; }
}

export async function getElbitProducts() {
  try {
    const result = await sql`SELECT product_id, product_name, category_name FROM elbit_products WHERE category_name = 'C4I' LIMIT 10`;
    return result;
  } catch (error) { return []; }
}

export async function triggerRetoolWorkflow(payload) {
  try {
    const retoolUrl = "https://api.retool.com/v1/workflows/6729265a-5fd9-44df-8cd8-de7f7065e9b1/startTrigger";
    await fetch(retoolUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Workflow-Api-Key': process.env.RETOOL_WORKFLOW_API_KEY
      },
      body: JSON.stringify(payload)
    });
  } catch (error) { console.error(error); }
}
