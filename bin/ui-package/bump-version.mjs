import { readFileSync, writeFileSync } from "node:fs";

const [kind, rawNote] = process.argv.slice(2);
const note = rawNote?.trim();
const index = ["major", "minor", "patch"].indexOf(kind);
if (index === -1 || !note) {
  throw new Error("Provide a major, minor or patch bump and a changelog note.");
}

/** @type {unknown} */
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
if (
  !manifest ||
  typeof manifest !== "object" ||
  !("version" in manifest) ||
  typeof manifest.version !== "string" ||
  !/^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2}$/.test(manifest.version)
) {
  throw new Error("The bump workflow requires a stable package version.");
}
const version = manifest.version
  .split(".")
  .map((part, i) => (i < index ? part : i === index ? BigInt(part) + 1n : 0))
  .join(".");

const header = "# Changelog\n\n";
const history = readFileSync("CHANGELOG.md", "utf8");
if (!history.startsWith(header)) {
  throw new Error("Missing changelog heading.");
}
const date = new Date().toISOString().slice(0, 10);
const bullets = note
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
const entry = `## ${version} (${date})\n\n${bullets.map((line) => `- ${line}`).join("\n")}\n\n`;
writeFileSync("CHANGELOG.md", header + entry + history.slice(header.length));
writeFileSync(
  "package.json",
  JSON.stringify({ ...manifest, version }, null, 2) + "\n",
);
console.log(version);
