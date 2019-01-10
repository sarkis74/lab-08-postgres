'use strict';

//=============
// Dependencies
//=============

const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');

require('dotenv').config();

const PORT = process.env.PORT || 3000;

//======================
// Database - PostgreSQL
//======================

const client = new pg.Client(process.env.DATABASE_URL);
client.connect();

client.on('error', err => console.log(err));

//==========================================
// Meetup Functions
//==========================================

const app = express();

app.use(cors());

//=================
// Global Variables
//=================

const timeout = {
  weather: 15000,
  meetups: 86400000,
  yelp: 86400000,
  trails: 86400000,
  movies: 86400000
}

//======
// Paths
//======

app.get('/location', getLocation);

app.get('/weather', getWeather);

app.get('/yelp', getYelp);

app.get('/movies', getMovies);

app.get('/meetups', getMeetups);

app.get('/trails', getTrail);

app.get('/*', function(req, resp){
  resp.status(500).send('Don\'t look behind the curtain');
});

//==========================================
// Lookup Functions
//==========================================

function lookupLocation (query, handler) {
  console.log('**Location: Searching for record in DB');
  const SQL = 'SELECT * FROM locations WHERE search_query=$1';
  const values = [query];

  return client.query(SQL, values)
    .then(data => {
      if(data.rowCount) {
        console.log('**Location: Found in DB');
        handler.cacheHit(data.rows[0]);
      } else {
        console.log('**Location: Not found in DB, requesting from Google');
        handler.cacheMiss(query);
      }
    })
    .catch(err => console.log(err));
}

function lookup(name, latitude, longitude, id, table, handler) {
  console.log(`**${table}: Searching for record in DB`);
  const SQL = `SELECT * FROM ${table} WHERE location_id=$1`;
  const values = [id];

  return client.query(SQL, values)
    .then(data => {
      if(data.rowCount) {
        console.log(`**${table}: Found in DB`);
        if(Date.now() - data.rows[0].created_at > timeout[`${table}`]) {
          
          console.log(`${table}: Going to DELETE TABLE`);
          const SQL = `DELETE FROM ${table} WHERE location_id=$1`;
          const values = [id];
          client.query(SQL, values)
            .catch(err => console.log(err));
          handler.cacheMiss(name, latitude, longitude, id);
        } else {
          handler.cacheHit(data);
        }
      } else {
        console.log(`**${table}: Not found in DB, requesting from API`);
        handler.cacheMiss(name, latitude, longitude, id);
      }
    })
    .catch(err => console.log(err));
}

//==========================================
// Location Functions
//==========================================

function getLocation(req, res) {
  let lookupHandler = {
    cacheHit: (data) => {
      console.log('**Location: Retrieved from DB');
      res.status(200).send(data);
    },
    cacheMiss: (query) => {
      return fetchLocation(query)
        .then( result => {
          res.send(result);
        })
        .catch(error=>console.log(error));
    },
  };

  lookupLocation(req.query.data, lookupHandler);
}

function fetchLocation (query) {
  const URL = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;

  return superagent.get(URL)
    .then( result => {
      console.log('**Location: Retrieved from Google');
      let location = new Location(result.body.results[0]);

      let SQL = `INSERT INTO locations
                (search_query, formatted_query, latitude, longitude) 
                VALUES($1, $2, $3, $4)
                RETURNING id`;

      console.log('**Location: Storing in DB');
      return client.query(SQL, [query, location.formatted_query, location.latitude, location.longitude])
        .then((result) => {
          console.log('**Location: Finished storing in DB');
          location.id = result.rows[0].id;
          return location;
        });
    })
    .catch(err => {
      console.error(err);
      res.send(err);
    });
}

//==========================================
// Weather Functions
//==========================================

function getWeather(req, res) {
  let lookupHandler = {
    cacheHit: (data) => {
      console.log('**Weather: Retrieved from DB');

      let result = data.rows

      res.status(200).send(result);
    },
    cacheMiss: (name, latitude, longitude, id) => {
      return fetchWeather(name, latitude, longitude, id)
        .then(result => {
          res.send(result);
        })
        .catch(error => console.log(error));
    },
  };
  let query = req.query.data;
  lookup(query.formatted_query, query.latitude, query.longitude, query.id, 'weather', lookupHandler);
}

function fetchWeather(name, lat, long, id) {
  const URL = `https://api.darksky.net/forecast/${process.env.DARKSKY_API_KEY}/${lat},${long}`;

  return superagent.get(URL)
    .then(result => {
      console.log('**Weather: Retrieved from Darksky');

      const dailyForecast = result.body.daily.data;
      let weeklyForecast = dailyForecast.map( ele => {
        return new Forecast(ele);
      });

      console.log('**Weather: Storing in DB');
      let SQL = `INSERT INTO weather 
              (forecast, time, location_id, created_at)
              VALUES($1, $2, $3, $4)`;

      weeklyForecast.map(daily => {
        client.query(SQL, [daily.forecast, daily.time, id, Date.now()]);
      });
      console.log('**Weather: Finished storing in DB');
      return weeklyForecast;
    })
    .catch(err => console.log(err));
}

//==========================================
// Yelp Functions
//==========================================

function getYelp(req, res) {
  let lookupHandler = {
    cacheHit: (data) => {
      console.log('**Yelp: Retrieved from DB');
      let result = data.rows;

      res.status(200).send(result); //TODO: Data may need to be parsed
    },
    cacheMiss: (name, latitude, longitude, id) => {
      return fetchYelp(name, latitude, longitude, id)
        .then(result => {
          res.send(result);
        })
        .catch(err => console.log(err));
    },
  };
  let query = req.query.data;
  lookup(query.formatted_query, query.latitude, query.longitude, query.id, 'restaurants', lookupHandler);
}

function fetchYelp(name, lat, long, id) {
  const URL = `https://api.yelp.com/v3/businesses/search?term=restaurants&latitude=${lat}&longitude=${long}&limit=20`;

  return superagent.get(URL)
    .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
    .then(result => {
      console.log('**Yelp: Retrieved from Yelp');

      const restaurantData = JSON.parse(result.text);
      let restaurantArray = restaurantData.businesses.map(business => {
        return new Restaurant(business);
      });

      console.log('Yelp: Storing in DB');
      let SQL = `INSERT INTO restaurants
                (name, image_url, price, rating, url, location_id, created_at)
                VALUES($1, $2, $3, $4, $5, $6, $7)`;

      restaurantArray.map(biz => {
        client.query(SQL, [biz.name, biz.image_url, biz.price, biz.rating, biz.url, id, Date.now()]);
      });
      console.log('**Yelp: Finshed storing in DB');
      return restaurantArray;
    })
    .catch(err => console.log(err));
}

//==========================================
// Movies Functions
//==========================================

function getMovies(req, res) {
  let lookupHandler = {
    cacheHit: (data) => {
      console.log('**Movies: Retrieved from DB');
      let result = data.rows;
      res.status(200).send(result);
    },
    cacheMiss: (name) => {
      return fetchMovies(name, query.id)
        .then(result => {
          res.send(result);
        })
        .catch(err => console.log(err));
    },
  };
  let query = req.query.data;
  lookup(query.formatted_query, query.latitude, query.longitude, query.id, 'movies', lookupHandler);
}

function fetchMovies(name, id) {
  let citySplice = name.split(',');
  const URL = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIES_API_KEY}&query=${citySplice[0]}, ${citySplice[1]}`;

  return superagent.get(URL)
    .then(result => {
      console.log('**Movies: Retrieved from Movie DB');
      let films = result.body.results;
      films.sort( function(a, b) {
        if(a.popularity > b.popularity) return -1;
        if(b.popularity > a.popularity) return 1;
        return 0;
      });

      let numFilms = 20;
      if(films.length < 20) numFilms = films.length;

      let filmArray = [];
      for(let i = 0; i < numFilms; i++) {
        filmArray.push(new Film(films[i]));
      }
      console.log('**Movies: Storing in DB');
      let SQL = `INSERT INTO movies
              (title, overview, average_votes, total_votes, image_url, popularity, released_on, location_id, created_at)
              VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

      filmArray.map(film => {
        client.query(SQL, [film.title, film.overview, film.average_votes, film.total_votes, film.image_url, film.popularity, film.released_on, id, Date.now()])
      });
      console.log('**MOVIES: Finished storing in DB');
      return filmArray;
    })
    .catch(err => console.log(err));
}

//==========================================
// Meetup Functions
//==========================================

function getMeetups(req, res) {
  let lookupHandler = {
    cacheHit: (data) => {
      console.log('**Meetup: Retrieved from DB');
      let result = data.rows;

      res.status(200).send(result);
    },
    cacheMiss: (name, latitude, longitude, id) => {
      return fetchMeetups(name, latitude, longitude, id)
        .then(result => {
          res.send(result);
        })
        .catch(err => console.log(err));
    }
  };
    let query = req.query.data;
    lookup(query.formatted_query, query.latitude, query.longitude, query.id, 'meetups', lookupHandler);
};

function fetchMeetups(name, lat, long, id) {
  const URL = `https://api.meetup.com/2/concierge?key=${process.env.MEETUP_API_KEY}&lat=${lat}&lon=${long}`;

  return superagent.get(URL)
    .then(result => {
      console.log('**Meetups: Retrieved from API');
      const meetupData = JSON.parse(result.text);

      let meetupArray = meetupData.results.map(meetup => {
        return new Meetup(meetup);
      });

      console.log('**Meetup: Storing in DB');
      let SQL = `INSERT INTO meetups
                (link, name, creation_date, host, location_id, created_at)
                VALUES($1, $2, $3, $4, $5, $6)`;

      meetupArray.map(meetup => {
        client.query(SQL, [meetup.link, meetup.name, meetup.creation_date, meetup.host, id, Date.now()])
      });
      console.log('**Meetups: Finished storing in DB');
      return meetupArray;
    })
    .catch(err => console.log(err));
};

//==========================================
// Trail Functions
//==========================================

function getTrail(req, res) {
  let lookupHandler = {
    cacheHit: (data) => {
      console.log('**Trails: Retrieved from DB');
      let result = data.rows;
      res.status(200).send(result);
    },
    cacheMiss: (name, lat, long, id) => {
      return fetchTrail(name, lat, long, query.id)
        .then(result => {
          res.send(result);
        })
        .catch(err => console.log(err));
    },
  };
  let query = req.query.data;
  lookup(query.formatted_query, query.latitude, query.longitude, query.id, 'trails', lookupHandler);
}

function fetchTrail(name, lat, long, id) {
  const URL = `https://www.hikingproject.com/data/get-trails?lat=${lat}&lon=${long}&key=${process.env.HIKING_API_KEY}`;

  return superagent.get(URL)
    .then(result => {
      console.log('**Trails: Retrieved from API');
      let trailData = JSON.parse(result.text);

      let trailArray = trailData.trails.map(trail => {
        return new Trail(trail);
      });

      console.log('**Trails: Storing in DB');
      let SQL = `INSERT INTO trails
              (name, location, length, stars, star_votes, summary, trail_url, conditions, condition_date, condition_time, location_id, created_at)
              VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`;

      trailArray.map(trail => {
        client.query(SQL, [trail.name, trail.location, trail.length, trail.stars, trail.star_votes, trail.summary, trail.trail_url, trail. conditions, trail.condition_date, trail.condition_time, id, Date.now()])
      });
      console.log('**Trail: Finished storing in DB');
      return trailArray;
    })
    .catch(err => console.log(err));
}

//=============
// Constructors
//=============

function Location (location, query) {
  this.search_query = query;
  this.formatted_query = location.formatted_address;
  this.latitude = location.geometry.location.lat;
  this.longitude = location.geometry.location.lng;
}

function Forecast (day) {
  this.forecast = day.summary;
  let date = new Date(day.time * 1000);
  this.time = date.toDateString();
}

function Restaurant (business) {
  this.name = business.name;
  this.image_url = business.image_url;
  this.price = business.price;
  this.rating = business.rating;
  this.url = business.url;
}

function Film (video) {
  this.title = video.title;
  this.overview = video.overview;
  this.average_votes = video.vote_average;
  this.total_votes = video.vote_count;
  this.image_url = 'https://image.tmdb.org/t/p/w200_and_h300_bestv2/' + video.poster_path;
  this.popularity = video.popularity;
  this.released_on = video.release_date;
}

function Meetup (meetup) {
  this.link = meetup.event_url;
  this.name = meetup.name;
  let date = new Date(meetup.created);
  this.creation_date = date.toDateString();
  this.host = meetup.group.name;
}

function Trail (trail) {
  this.name = trail.name;
  this.location = trail.location;
  this.length = trail.length;
  this.stars = trail.stars;
  this.star_votes = trail.starVotes;
  this.summary = trail.summary;
  this.trail_url = trail.url;
  this.conditions = trail.conditionDetails;

  let condition = trail.conditionDate.split(' ');
  this.condition_date = condition[0];
  this.condition_time = condition[1];
}

//=========
// Listener
//=========

app.listen(PORT, () => {
  console.log('app is up on port 3000');
});
