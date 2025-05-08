#!node

const namespace = process.argv[2];

const fs = require("fs");
const debounce = require("lodash.debounce");
const { spawn } = require('child_process');

const debouncedHandler = debounce((event, filename) => {
  console.log(`Change detected: ${event} - ${filename}`);

  const child = spawn('node', namespace?['target/node-tests.js', "--test="+ namespace]:['target/node-tests.js'], { stdio: 'inherit' });
}, 300);

console.log("Watching target/node-tests.js");

fs.watch("target/node-tests.js", { recursive: true }, debouncedHandler);

debouncedHandler();
