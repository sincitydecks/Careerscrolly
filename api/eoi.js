const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// On Vercel serverless, root fs is read-only so use /tmp, otherwise use current working dir
const DATA_FILE = path.join(process.env.VERCEL ? '/tmp' : process.cwd(), 'submissions.json');

function loadSubmissions() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw) || [];
  } catch (err) {
    return [];
  }
}

function saveSubmission(item) {
  try {
    const list = loadSubmissions();
    list.unshift(item);
    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
    return true;
  } catch (err) {
    return false;
  }
}

function getEmailTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    });
  }
  return null;
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    const list = loadSubmissions();
    return res.status(200).json({
      total: list.length,
      targetRecipient: process.env.NOTIFICATION_EMAIL || 'stories@flyingdoctor.net',
      smtpConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
      submissions: list
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      role,
      stateId,
      sectionName,
      recipientEmail
    } = req.body || {};

    if (!firstName || !lastName || !email || !role) {
      return res.status(400).json({
        success: false,
        error: 'Please complete all required fields: first name, last name, email address, and preferred role.'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid email address.'
      });
    }

    const targetEmail = recipientEmail || process.env.NOTIFICATION_EMAIL || 'stories@flyingdoctor.net';
    const submissionId = `eoi_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toISOString();
    const formattedDate = new Date().toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      dateStyle: 'full',
      timeStyle: 'medium'
    });

    const submissionRecord = {
      id: submissionId,
      receivedAt: timestamp,
      formattedDate,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: (phone || '').trim(),
      role: role.trim(),
      stateId: stateId || 'N/A',
      sectionName: sectionName || 'National / General',
      targetRecipient: targetEmail,
      emailDelivery: {
        attempted: false,
        sent: false,
        info: null
      }
    };

    const transporter = getEmailTransporter();
    let emailSent = false;
    let emailStatusMessage = '';

    if (transporter) {
      submissionRecord.emailDelivery.attempted = true;
      try {
        const mailOptions = {
          from: process.env.FROM_EMAIL || `"RFDS Careers Talent Portal" <${process.env.SMTP_USER}>`,
          to: targetEmail,
          replyTo: `"${submissionRecord.firstName} ${submissionRecord.lastName}" <${submissionRecord.email}>`,
          subject: `[RFDS Careers EOI] ${submissionRecord.role} - ${submissionRecord.firstName} ${submissionRecord.lastName} (${submissionRecord.sectionName})`,
          text: `Royal Flying Doctor Service — Expression of Interest\n` +
                `--------------------------------------------------\n` +
                `Candidate Name: ${submissionRecord.firstName} ${submissionRecord.lastName}\n` +
                `Email: ${submissionRecord.email}\n` +
                `Phone: ${submissionRecord.phone || 'Not provided'}\n` +
                `Preferred Role: ${submissionRecord.role}\n` +
                `RFDS Section / State: ${submissionRecord.sectionName} (${submissionRecord.stateId})\n` +
                `Submission Date: ${formattedDate}\n` +
                `Reference ID: ${submissionId}\n\n` +
                `Reply to this email to contact the candidate directly.\n`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,32,91,0.08);">
              <div style="background: #00205b; padding: 24px 28px; text-align: left;">
                <p style="margin: 0; color: #f05b22; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em;">Royal Flying Doctor Service</p>
                <h1 style="margin: 6px 0 0; color: #ffffff; font-size: 20px; font-weight: 700;">New Expression of Interest Captured</h1>
              </div>
              <div style="padding: 28px;">
                <p style="margin: 0 0 20px; font-size: 15px; color: #334155; line-height: 1.5;">
                  A new candidate has registered their interest in joining the Royal Flying Doctor Service talent community:
                </p>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 10px 0; font-weight: 600; color: #64748b; width: 140px;">Candidate Name</td>
                    <td style="padding: 10px 0; color: #0f172a; font-weight: 700;">${submissionRecord.firstName} ${submissionRecord.lastName}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Email Address</td>
                    <td style="padding: 10px 0; color: #00205b; font-weight: 600;"><a href="mailto:${submissionRecord.email}" style="color: #00205b; text-decoration: underline;">${submissionRecord.email}</a></td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Phone Number</td>
                    <td style="padding: 10px 0; color: #0f172a;">${submissionRecord.phone || '<em style="color:#94a3b8;">Not provided</em>'}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Preferred Role</td>
                    <td style="padding: 10px 0; color: #f05b22; font-weight: 700;">${submissionRecord.role}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 10px 0; font-weight: 600; color: #64748b;">RFDS Section</td>
                    <td style="padding: 10px 0; color: #0f172a;">${submissionRecord.sectionName} (${submissionRecord.stateId})</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Submission Time</td>
                    <td style="padding: 10px 0; color: #64748b;">${formattedDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; font-weight: 600; color: #64748b;">Reference ID</td>
                    <td style="padding: 10px 0; color: #94a3b8; font-family: monospace; font-size: 12px;">${submissionId}</td>
                  </tr>
                </table>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; text-align: center;">
                  <p style="margin: 0; font-size: 13px; color: #475569;">
                    You can reply directly to this notification email to contact <strong>${submissionRecord.firstName} ${submissionRecord.lastName}</strong>.
                  </p>
                </div>
              </div>
            </div>
          `
        };

        const sendResult = await transporter.sendMail(mailOptions);
        emailSent = true;
        submissionRecord.emailDelivery.sent = true;
        submissionRecord.emailDelivery.info = sendResult.messageId || 'Sent';
        emailStatusMessage = `Email dispatched to ${targetEmail}`;
        console.log(`[EOI] Email successfully dispatched to ${targetEmail}`);
      } catch (mailErr) {
        console.error(`[EOI] SMTP send error:`, mailErr.message);
        submissionRecord.emailDelivery.error = mailErr.message;
        emailStatusMessage = `SMTP notice: ${mailErr.message}`;
      }
    } else {
      emailStatusMessage = `Captured successfully. (SMTP credentials not set)`;
    }

    saveSubmission(submissionRecord);

    return res.status(200).json({
      success: true,
      submissionId,
      recipient: targetEmail,
      emailSent,
      statusMessage: emailStatusMessage,
      data: {
        name: `${submissionRecord.firstName} ${submissionRecord.lastName}`,
        role: submissionRecord.role,
        section: submissionRecord.sectionName
      }
    });
  } catch (error) {
    console.error('Error processing EOI:', error);
    return res.status(500).json({
      success: false,
      error: 'An internal error occurred while processing your expression of interest.'
    });
  }
};
