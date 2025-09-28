import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://nagarajamutha0_db_user:shield123@cluster0.vx3tlgk.mongodb.net/kseb?retryWrites=true&w=majority&appName=cluster0';
try {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB Atlas');
} catch (err) {
  console.error('❌ MongoDB connection failed:', err.message);
  console.log('💡 Make sure to replace the connection string with your Atlas URI');
  process.exit(1);
}

const DeviceSchema = new mongoose.Schema({
  deviceId: { type: String, unique: true, index: true },
  name: String,
  firmware: String,
  location: String,
  coords: { type: [Number], index: '2dsphere' },
  lastReboot: Date,
  uptimeMs: Number,
});
const ReadingSchema = new mongoose.Schema({
  deviceId: { type: String, index: true },
  voltage: Number,
  current: Number,
  ts: { type: Date, default: () => new Date(), index: true }
});
const AlertSchema = new mongoose.Schema({
  deviceId: String,
  title: String,
  location: String,
  coords: [Number],
  severity: { type: String, enum: ['info','warning','danger'], default: 'info' },
  ts: { type: Date, default: () => new Date(), index: true }
});

const Device = mongoose.model('Device', DeviceSchema);
const Reading = mongoose.model('Reading', ReadingSchema);
const Alert = mongoose.model('Alert', AlertSchema);

// Health classifier
function computeHealth(voltage){
  if (voltage < 200 || voltage > 260) return 'danger';
  if (voltage < 210 || voltage > 250) return 'warning';
  return 'info';
}

// Ingest from ESP8266
// POST /ingest { deviceId, voltage, current, coords?, location? }
app.post('/ingest', async (req, res) => {
  const { deviceId, voltage, current, coords, location } = req.body || {};
  if (!deviceId || typeof voltage !== 'number') return res.status(400).json({ error: 'deviceId and numeric voltage required' });

  const last = await Reading.findOne({ deviceId }).sort({ ts: -1 }).lean();
  await Reading.create({ deviceId, voltage, current });
  const now = new Date();
  await Device.updateOne({ deviceId }, { $setOnInsert: { name: deviceId, firmware: 'esp8266', lastReboot: now, uptimeMs: 0 }, $set: { coords, location } }, { upsert: true });
  // Current spike detection (simple): threshold or sudden jump > 2x
  const currentValue = typeof current === 'number' ? current : null;
  const spike = (currentValue !== null && (currentValue > 2.0 || (last?.current && currentValue > last.current * 2)));
  if (spike) {
    await Alert.create({ deviceId, title: 'Unauthorized electric fence detected', location, coords, severity: 'danger', ts: new Date(), type: 'current_spike' });
  } else {
    const sev = computeHealth(voltage);
    if (sev !== 'info') {
      await Alert.create({ deviceId, title: 'Voltage out of optimal range', location, coords, severity: sev, ts: new Date(), type: 'voltage' });
    }
  }
  res.json({ ok: true });
});

// API
app.get('/api/devices', async (req, res) => {
  const list = await Device.find().lean();
  res.json(list.map(d => ({ id: d.deviceId, name: d.name, firmware: d.firmware, location: d.location, coords: d.coords, signal: 80, lastReboot: d.lastReboot, uptimeMs: d.uptimeMs })));
});

app.get('/api/live', async (req, res) => {
  const r = await Reading.findOne().sort({ ts: -1 }).lean();
  res.json({ voltage: r?.voltage ?? null, current: r?.current ?? null, timestamp: r?.ts ?? null });
});

app.get('/api/alerts', async (req, res) => {
  const alerts = await Alert.find().sort({ ts: -1 }).limit(200).lean();
  res.json(alerts.map(a => ({ id: String(a._id), title: a.title, deviceId: a.deviceId, location: a.location, coords: a.coords, severity: a.severity, type: a.type, timestamp: a.ts })));
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log('Backend listening on http://localhost:'+PORT));



