import crypto from 'node:crypto';

const RECIPIENTS = {
  WA: 'peopleandculture@rfdswa.com.au',
  SA_NT: 'stories@flyingdoctor.net',
  QLD: 'recruitment@rfdsqld.com.au',
  NSW: 'careers@rfdsse.org.au',
  VIC: 'careers@rfdsvic.com.au',
  TAS: 'recruitment@rfdstas.org.au'
};

const SECTION_NAMES = {
  WA: 'Western Australia',
  SA_NT: 'SA / NT',
  QLD: 'Queensland',
  NSW: 'New South Wales',
  VIC: 'Victoria',
  TAS: 'Tasmania'
};

const ALLOWED_ROLES = new Set([
  'Flight Nurse / Midwife',
  'Pilot',
  'Retrieval Specialist / Rural Generalist',
  'Oral Health',
  'Mental Health',
  'Engineering',
  'Operations & Logistics',
  'Paramedic',
  'Administration / Corporate',
  'Primary Health',
  'Allied Health'
]);

function clean(value, max = 200) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
}

function escapeHtml(value) {
  return clean(value, 2000)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

function countWords(value) {
  return clean(value, 2000).split(/\s+/).filter(Boolean).length;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!apiKey || !from) {
    console.error('Missing RESEND_API_KEY or RESEND_FROM environment variables.');
    return res.status(500).json({ ok: false, error: 'Email service is not configured.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Honeypot: bots complete this invisible field; return a successful no-op.
  if (clean(body.website, 200)) {
    return res.status(200).json({ ok: true });
  }

  const firstName = clean(body.firstName, 80);
  const lastName = clean(body.lastName, 80);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 60);
  const role = clean(body.role, 120);
  const why = clean(body.why, 2000);
  const stateId = clean(body.stateId, 20);

  const recipient = RECIPIENTS[stateId];
  const sectionName = SECTION_NAMES[stateId];

  if (!firstName || !lastName || !email || !role || !recipient || !sectionName) {
    return res.status(400).json({ ok: false, error: 'Please complete the required fields.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Please provide a valid email address.' });
  }

  if (!ALLOWED_ROLES.has(role)) {
    return res.status(400).json({ ok: false, error: 'Please select a valid preferred role.' });
  }

  if (countWords(why) > 100) {
    return res.status(400).json({ ok: false, error: 'Please keep your response to 100 words or fewer.' });
  }

  const submissionId = crypto.randomUUID();
  const submittedAt = new Date().toISOString();

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#121826;max-width:720px">
      <h2 style="color:#00205B;margin-bottom:4px">New RFDS Talent Community Expression of Interest</h2>
      <p style="margin-top:0;color:#5A6578">Submission ID: ${escapeHtml(submissionId)}</p>
      <hr style="border:0;border-top:1px solid #e5e7eb;margin:20px 0">
      <table cellpadding="7" cellspacing="0" style="border-collapse:collapse;width:100%">
        <tr><td><strong>Section</strong></td><td>${escapeHtml(sectionName)}</td></tr>
        <tr><td><strong>Preferred role</strong></td><td>${escapeHtml(role)}</td></tr>
        <tr><td><strong>First name</strong></td><td>${escapeHtml(firstName)}</td></tr>
        <tr><td><strong>Last name</strong></td><td>${escapeHtml(lastName)}</td></tr>
        <tr><td><strong>Email</strong></td><td>${escapeHtml(email)}</td></tr>
        <tr><td><strong>Phone</strong></td><td>${escapeHtml(phone || 'Not provided')}</td></tr>
      </table>
      <h3 style="color:#00205B;margin-bottom:6px">Why they want to join</h3>
      <p>${escapeHtml(why || 'Not provided')}</p>
      <p style="font-size:12px;color:#6b7280">Submitted ${escapeHtml(submittedAt)}</p>
    </div>
  `;

  const payload = {
    from,
    to: [recipient],
    reply_to: email,
    subject: `RFDS EOI — ${sectionName} — ${role} — ${firstName} ${lastName}`,
    html,
    text: [
      'New RFDS Talent Community Expression of Interest',
      `Submission ID: ${submissionId}`,
      `Section: ${sectionName}`,
      `Preferred role: ${role}`,
      `Name: ${firstName} ${lastName}`,
      `Email: ${email}`,
      `Phone: ${phone || 'Not provided'}`,
      `Why they want to join: ${why || 'Not provided'}`,
      `Submitted: ${submittedAt}`
    ].join('\n')
  };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('Resend error', {
        status: response.status,
        result,
        from,
        recipient,
        sectionName
      });

      // Return the actual provider message while keeping the UI-safe response small.
      return res.status(502).json({
        ok: false,
        error: result?.message || result?.name || 'The email service rejected the submission.',
        resendStatus: response.status
      });
    }

    console.info('EOI sent', { submissionId, sectionName, recipient });
    return res.status(200).json({ ok: true, submissionId });
  } catch (error) {
    console.error('EOI mail handler failed', error);
    return res.status(500).json({ ok: false, error: 'Unable to send the submission.' });
  }
}
