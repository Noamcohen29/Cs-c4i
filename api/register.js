import { neon } from '@neondatabase/serverless';

// Neon's Vercel integration automatically sets DATABASE_URL or POSTGRES_URL
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const sql = neon(connectionString);

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      // 1. כאן הוספנו את ה-language ואת שדות הרישום החדשים מהטופס
      const {
        phone,
        name,
        email,
        country,
        role,
        language,
        registration_type,
        employee_id,
        role_description,
        manager_approved
      } = req.body;

      const normalizedManagerApproved = manager_approved === true;

      // 2. עדכנו את ההכנסה (INSERT) והעדכון (UPDATE) שיכללו את שדות הרישום החדשים
      await sql`
        INSERT INTO Users (
          phone,
          name,
          email,
          country,
          role,
          language,
          status,
          registration_type,
          employee_id,
          role_description,
          manager_approved
        )
        VALUES (
          ${phone},
          ${name},
          ${email},
          ${country},
          ${role},
          ${language},
          'ACTIVE',
          ${registration_type},
          ${employee_id},
          ${role_description},
          ${normalizedManagerApproved}
        )
        ON CONFLICT (phone) DO UPDATE
        SET name = EXCLUDED.name,
            email = EXCLUDED.email,
            country = EXCLUDED.country,
            role = EXCLUDED.role,
            language = EXCLUDED.language,
            status = 'ACTIVE',
            registration_type = EXCLUDED.registration_type,
            employee_id = EXCLUDED.employee_id,
            role_description = EXCLUDED.role_description,
            manager_approved = EXCLUDED.manager_approved;
      `;

      // ברגע שזה מצליח - זה שולח אישור ל-HTML, ורק אז ה-HTML יעביר לדף ההצלחה
      return res.status(200).json({ success: true, message: 'Registration complete' });
      
    } catch (error) {
      console.error('Database Error:', error);
      return res.status(500).json({ error: 'Error saving to database: ' + error.message });
    }
  } else {
    // Block non-POST requests
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }
}
