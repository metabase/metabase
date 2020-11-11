#!/bin/env node

const fs = require("fs");

if (process.argv.length !== 4) {
  console.error("Usage:");
  console.log("  convert2annotations.js inputfile outputfile");
  process.exit(-1);
}

const inputfile = process.argv[2];
const outputfile = process.argv[3];
console.log("Converting", inputfile, "to", outputfile, "...");

const lines = fs
  .readFileSync(inputfile, "utf-8")
  .toString()
  .split("\n");
const entries = [];

// this is to match something like "foo/bar.js:42:1 error bla bla"
const pattern = /^([a-zA-Z\/\_\.]*)\:([0-9]+)\:([0-9]+)\:/;

lines.forEach(input => {
  const match = input.trim().match(pattern);
  if (match && match.length && match.length === 4) {
    const file = match[1];
    const line = parseInt(match[2]);
    const annotation_level = "error";
    const title = file;
    const message = input.replace(match[0], "").trim();
    entries.push({ file, line, annotation_level, title, message });
  }
});

fs.writeFileSync(outputfile, JSON.stringify(entries, null, 2), "utf-8");
