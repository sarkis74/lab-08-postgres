DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS weather;
DROP TABLE IF EXISTS restaurants;
DROP TABLE IF EXISTS movies;
DROP TABLE IF EXISTS meetups;
DROP TABLE IF EXISTS hiking;

CREATE TABLE locations (
  id SERIAL PRIMARY KEY,
  search_query VARCHAR(255),
  formatted_query VARCHAR(255),
  latitude NUMERIC,
  longitude NUMERIC
);

CREATE TABLE weather (
  id SERIAL PRIMARY KEY,
  created_at NUMERIC,
  forecast VARCHAR(255),
  time VARCHAR(255),
  location_id INTEGER NOT NULL REFERENCES locations(id)
);

CREATE TABLE restaurants (
  id SERIAL PRIMARY KEY,
  created_at NUMERIC,
  name VARCHAR(255),
  image_url VARCHAR(255),
  price CHAR(5),
  rating NUMERIC(2,1),
  url VARCHAR(255),
  location_id INTEGER NOT NULL REFERENCES locations(id)
);

CREATE TABLE movies (
  id SERIAL PRIMARY KEY,
  created_at NUMERIC,
  title VARCHAR(255),
  overview VARCHAR(1000),
  average_votes NUMERIC,
  total_votes INTEGER,
  image_url VARCHAR(255),
  popularity NUMERIC,
  released_on CHAR(10),
  location_id INTEGER NOT NULL REFERENCES locations(id)
);

CREATE TABLE meetups (
  id SERIAL PRIMARY KEY,
  created_at NUMERIC,
  link VARCHAR(255),
  name VARCHAR(255),
  creation_date CHAR(15),
  host VARCHAR(255),
  location_id INTEGER NOT NULL REFERENCES locations(id)
);

CREATE TABLE trails (
  id SERIAL PRIMARY KEY,
  created_at NUMERIC,
  name VARCHAR(255),
  location VARCHAR(255),
  length NUMERIC,
  stars NUMERIC,
  star_votes NUMERIC,
  summary TEXT,
  trail_url VARCHAR(255),
  conditions TEXT,
  condition_date CHAR(15),
  condition_time CHAR(15),
  location_id INTEGER NOT NULL REFERENCES locations(id)
);