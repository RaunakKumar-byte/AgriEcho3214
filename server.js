import express from 'express';
import mongoose from 'mongoose';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import expressLayouts from 'express-ejs-layouts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/agriecho';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Schemas
const sosSchema = new mongoose.Schema({
  message: { type: String, required: true },
  location: String,
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  contact: String,
  resolved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const voiceQuerySchema = new mongoose.Schema({
  query: { type: String, required: true },
  response: String,
  language: { type: String, default: 'en' },
  processed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const weatherAlertSchema = new mongoose.Schema({
  location: String,
  alert: String,
  severity: String,
  validUntil: Date,
  createdAt: { type: Date, default: Date.now }
});

const SOS = mongoose.model('SOS', sosSchema);
const VoiceQuery = mongoose.model('VoiceQuery', voiceQuerySchema);
const WeatherAlert = mongoose.model('WeatherAlert', weatherAlertSchema);

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cors());
app.use(expressLayouts);
app.set('layout', 'layout');

// Routes
app.get('/', (req, res) => {
  res.render('index', { title: 'AgriEcho - Smart Farming Assistant' });
});

app.get('/knowledge', (req, res) => {
  const articles = [
    {
      id: 1,
      title: 'Soil Health Management',
      content: 'Understanding soil pH, nutrients, and organic matter for optimal crop growth.',
      category: 'soil',
      readTime: '5 min',
      audioAvailable: true
    },
    {
      id: 2,
      title: 'Crop Rotation Benefits',
      content: 'How rotating crops improves soil fertility and reduces pest problems.',
      category: 'crops',
      readTime: '7 min',
      audioAvailable: true
    },
    {
      id: 3,
      title: 'Organic Fertilizers Guide',
      content: 'Natural fertilizer options and their application methods.',
      category: 'fertilizer',
      readTime: '6 min',
      audioAvailable: false
    },
    {
      id: 4,
      title: 'Pest Control Methods',
      content: 'Integrated pest management using natural and chemical methods.',
      category: 'pest',
      readTime: '8 min',
      audioAvailable: true
    }
  ];
  res.render('knowledge', { title: 'Knowledge Base', articles });
});

app.get('/weather', async (req, res) => {
  const alerts = await WeatherAlert.find().sort({ createdAt: -1 }).limit(5);
  res.render('weather', { title: 'Weather & Alerts', alerts });
});

app.get('/sos', (req, res) => {
  res.render('sos', { title: 'Emergency SOS' });
});

app.get('/voice', (req, res) => {
  res.render('voice', { title: 'Voice Assistant' });
});

// API Routes
app.post('/api/sos', async (req, res) => {
  try {
    const { message, location, severity, contact } = req.body;
    const sos = new SOS({ message, location, severity, contact });
    await sos.save();
    
    // Here you would typically send SMS or notify authorities
    console.log('SOS Alert:', { message, location, severity });
    
    res.json({ success: true, message: 'SOS alert sent successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/voice-query', async (req, res) => {
  try {
    const { query, language } = req.body;
    const voiceQuery = new VoiceQuery({ query, language });
    await voiceQuery.save();
    
    // Simple query processing (in real app, this would use AI/ML)
    let response = "Thank you for your question. Our experts will respond soon.";
    if (query.toLowerCase().includes('weather')) {
      response = "Current weather is sunny with temperatures around 28°C. No rain expected today.";
    } else if (query.toLowerCase().includes('pest')) {
      response = "For pest control, try neem oil spray or consult our pest management guide in the knowledge base.";
    }
    
    voiceQuery.response = response;
    voiceQuery.processed = true;
    await voiceQuery.save();
    
    res.json({ success: true, response });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/sync', async (req, res) => {
  try {
    const pendingSOS = await SOS.find({ resolved: false }).sort({ createdAt: -1 });
    const recentQueries = await VoiceQuery.find().sort({ createdAt: -1 }).limit(10);
    const weatherAlerts = await WeatherAlert.find({ validUntil: { $gte: new Date() } });
    
    res.json({
      success: true,
      data: {
        sos: pendingSOS,
        queries: recentQueries,
        weather: weatherAlerts
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PWA Routes
app.get('/manifest.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

app.get('/sw.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌾 AgriEcho server running on http://localhost:${PORT}`);
});