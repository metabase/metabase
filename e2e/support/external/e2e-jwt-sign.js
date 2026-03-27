#!/usr/bin/env node

const process = require("process");

const jwt = require("jsonwebtoken");

const payload = process.argv[2];
const METABASE_SECRET_KEY = process.argv[3];

const token = jwt.sign(payload, METABASE_SECRET_KEY);

console.log(token);
