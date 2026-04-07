const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.static(__dirname + '/public'));

// ── Rate Limiter ──
const limiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,  // 24 hours
  max: 10,                          // 10 requests per day per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).render('index', {
      rainData: null,
      error: '⛔ Too many requests — you have used your 10 daily checks. Please come back tomorrow!'
    });
  }
});

app.use('/', limiter);

app.get('/', async (req, res) => {
  try {
    const response = await axios.get(
      'https://api.openweathermap.org/data/2.5/forecast', {
        params: {
          q: 'Mumbai',
          units: 'metric',
          appid: process.env.API_KEY
        }
      }
    );

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = tomorrow.toISOString().split('T')[0];

    const tomorrowForecasts = response.data.list.filter(item =>
      item.dt_txt.startsWith(tomorrowDate)
    );

    const forecast =
      tomorrowForecasts.find(item => item.dt_txt.includes('12:00')) ||
      tomorrowForecasts[0];

    const temps = tomorrowForecasts.map(item => item.main.temp);
    const tempMin = Math.min(...temps).toFixed(1);
    const tempMax = Math.max(...temps).toFixed(1);
    const maxPop = Math.max(...tomorrowForecasts.map(item => item.pop || 0));

    const rainData = {
      date: tomorrow.toLocaleDateString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      }),
      time: new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit'
      }),
      description: forecast.weather[0].description,
      icon: forecast.weather[0].icon,
      pop: Math.round(maxPop * 100),
      rain: forecast.rain ? forecast.rain['3h'] : 0,
      tempMin,
      tempMax,
      humidity: forecast.main.humidity,
      willRain: maxPop >= 0.4
    };

    res.render('index', { rainData, error: null });

  } catch (error) {
    console.error(error.message);
    res.render('index', { rainData: null, error: 'Could not fetch weather data.' });
  }
});

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});