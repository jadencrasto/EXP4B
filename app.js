const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
require('dotenv').config();

const app = express();
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.static(__dirname + '/public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── Session (for recent searches) ──
app.use(session({
  secret: 'weather-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ── Rate Limiter ──
const limiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).render('index', {
      rainData: null,
      fiveDay: null,
      hourlyChart: null,
      recentSearches: req.session.recentSearches || [],
      city: req.query.city || 'Mumbai',
      error: '⛔ Too many requests — you have used your 10 daily checks. Please come back tomorrow!'
    });
  }
});

app.use('/', limiter);

// ── Helper: fetch weather for a city ──
async function getWeather(city) {
  const response = await axios.get(
    'https://api.openweathermap.org/data/2.5/forecast', {
      params: { q: city, units: 'metric', appid: process.env.API_KEY }
    }
  );

  const list = response.data.list;

  // ── Tomorrow's forecast ──
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDate = tomorrow.toISOString().split('T')[0];

  const tomorrowForecasts = list.filter(item => item.dt_txt.startsWith(tomorrowDate));
  const forecast = tomorrowForecasts.find(item => item.dt_txt.includes('12:00')) || tomorrowForecasts[0];
  const temps = tomorrowForecasts.map(item => item.main.temp);
  const maxPop = Math.max(...tomorrowForecasts.map(item => item.pop || 0));

  const rainData = {
    city: response.data.city.name,
    country: response.data.city.country,
    date: tomorrow.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    description: forecast.weather[0].description,
    icon: forecast.weather[0].icon,
    pop: Math.round(maxPop * 100),
    rain: forecast.rain ? forecast.rain['3h'] : 0,
    tempMin: Math.min(...temps).toFixed(1),
    tempMax: Math.max(...temps).toFixed(1),
    feelsLike: forecast.main.feels_like.toFixed(1),
    humidity: forecast.main.humidity,
    windSpeed: forecast.wind.speed.toFixed(1),
    willRain: maxPop >= 0.4
  };

  // ── 5-day forecast ──
  const fiveDay = [];
  for (let i = 1; i <= 5; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const daySlots = list.filter(item => item.dt_txt.startsWith(dateStr));
    if (!daySlots.length) continue;

    const dayForecast = daySlots.find(s => s.dt_txt.includes('12:00')) || daySlots[0];
    const dayTemps = daySlots.map(s => s.main.temp);
    const dayPop = Math.max(...daySlots.map(s => s.pop || 0));

    fiveDay.push({
      day: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      icon: dayForecast.weather[0].icon,
      description: dayForecast.weather[0].description,
      tempMin: Math.min(...dayTemps).toFixed(0),
      tempMax: Math.max(...dayTemps).toFixed(0),
      pop: Math.round(dayPop * 100)
    });
  }

  // ── Hourly chart data (next 24 hours = 8 x 3hr slots) ──
  const hourlyChart = list.slice(0, 8).map(item => ({
    time: new Date(item.dt * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    temp: item.main.temp.toFixed(1),
    pop: Math.round((item.pop || 0) * 100)
  }));

  return { rainData, fiveDay, hourlyChart };
}

// ── GET / ──
app.get('/', async (req, res) => {
  const city = req.query.city || 'Mumbai';
  const recentSearches = req.session.recentSearches || [];

  try {
    const { rainData, fiveDay, hourlyChart } = await getWeather(city);

    // Update recent searches (max 3, no duplicates)
    const updated = [rainData.city, ...recentSearches.filter(c => c.toLowerCase() !== rainData.city.toLowerCase())].slice(0, 3);
    req.session.recentSearches = updated;

    res.render('index', { rainData, fiveDay, hourlyChart, recentSearches: updated, city: rainData.city, error: null });

  } catch (err) {
    const isNotFound = err.response && err.response.status === 404;
    res.render('index', {
      rainData: null, fiveDay: null, hourlyChart: null,
      recentSearches, city,
      error: isNotFound ? `❌ City "${city}" not found. Please try another.` : '⚠️ Could not fetch weather data. Check your API key.'
    });
  }
});

// ── POST /search (city search form) ──
app.post('/search', (req, res) => {
  const city = req.body.city ? req.body.city.trim() : 'Mumbai';
  res.redirect(`/?city=${encodeURIComponent(city)}`);
});

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});