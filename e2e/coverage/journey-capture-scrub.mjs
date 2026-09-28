/**
 * Replaces secrets and token-shaped strings in a journey-capture raw directory, then checks that no secret is left.
 * The rules are described in e2e/journey-capture/README.md.
 *
 *   JOURNEY_SCRUB_SECRETS='{"NAME": "value", ...}' node e2e/coverage/journey-capture-scrub.mjs <raw dir>
 *
 * It prints only counts and file names, never a value, and exits with 1 when anything is left.
 */
import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

export const PLACEHOLDER = "<scrubbed>";
export const MIN_SECRET_LENGTH = 16;
export const FRAGMENT_LENGTH = 20;

const BINARY_EXTENSIONS = new Set([".exec"]);
const MAX_LISTED = 20;

// Each pattern matches only characters that JSON strings hold unescaped, so a replacement never breaks the JSON around it.
export const TOKEN_RULES = [
  {
    rule: "jwt",
    pattern: /(?<![\w-])eyJ[\w-]+\.[\w-]+(?:\.[\w-]*)+/g,
  },
  {
    rule: "prefixed-token",
    pattern:
      /(?<![A-Za-z0-9])(?:ghp_|gho_|github_pat_|dckr_pat_|mb_dev_|airgap_)[\w.-]{8,}/g,
  },
  {
    rule: "hex-64",
    pattern: /(?<![0-9A-Fa-f])[0-9A-Fa-f]{64,}(?![0-9A-Fa-f])/g,
  },
  {
    rule: "query-param",
    pattern:
      /(?<=[?&;][\w.%[\]-]*(?:token|secret|passw(?:or)?d|session|jwt|api[-_]?key|auth|signature|credential)[\w.%[\]-]*=)[\w.~%+/=:@-]+/gi,
  },
];

// No rule can match in a string shorter than this.
const SHORTEST_MATCH = 6;

export const RULES = ["secret", ...TOKEN_RULES.map(({ rule }) => rule)];

/**
 * The values to scrub from `toJSON(secrets)`: each value, trimmed, and each of its lines,
 * leaving out anything shorter than MIN_SECRET_LENGTH.
 */
export function parseSecrets(json) {
  const parsed = json ? JSON.parse(json) : null;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("expected a JSON object of secret names and values");
  }
  const secrets = [];
  let short = 0;
  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value !== "string") {
      continue;
    }
    const values = new Set(
      [
        value,
        value.trim(),
        ...value.split(/\r?\n/).map((line) => line.trim()),
      ].filter((candidate) => candidate.length >= MIN_SECRET_LENGTH),
    );
    if (values.size === 0) {
      short += 1;
    }
    for (const candidate of values) {
      secrets.push({ name, value: candidate });
    }
  }
  return {
    secrets,
    names: new Set(secrets.map(({ name }) => name)).size,
    short,
  };
}

/**
 * The spellings a value can take in the capture: as it is, escaped once or twice for JSON, URL-encoded,
 * and base64 at each of the three byte alignments, trimmed to the characters that depend on the value alone.
 */
export function secretForms(value) {
  const json = JSON.stringify(value).slice(1, -1);
  const url = encodeURIComponent(value);
  const forms = new Set([
    value,
    json,
    JSON.stringify(json).slice(1, -1),
    url,
    url.replace(/%20/g, "+"),
  ]);
  const bytes = Buffer.from(value, "utf8");
  for (let shift = 0; shift < 3; shift++) {
    const shifted = Buffer.concat([Buffer.alloc(shift), bytes]);
    const base64 = shifted
      .toString("base64")
      .slice(Math.ceil((shift * 8) / 6), Math.floor((shifted.length * 8) / 6));
    forms.add(base64);
    forms.add(base64.replace(/\+/g, "-").replace(/\//g, "_"));
  }
  return [...forms].filter((form) => form.length >= MIN_SECRET_LENGTH);
}

// Each form of up to FRAGMENT_LENGTH characters as it is, and every FRAGMENT_LENGTH-character piece of a longer one,
// so a clipped form still matches.
function fragments(secrets, encode = (text) => text) {
  const byFragment = new Map();
  for (const { name, value } of secrets) {
    for (const form of secretForms(value)) {
      const pieces =
        form.length <= FRAGMENT_LENGTH
          ? [form]
          : Array.from({ length: form.length - FRAGMENT_LENGTH + 1 }, (_, i) =>
              form.slice(i, i + FRAGMENT_LENGTH),
            );
      for (const piece of pieces) {
        const key = encode(piece);
        if (!byFragment.has(key)) {
          byFragment.set(key, name);
        }
      }
    }
  }
  return byFragment;
}

const FILTER_BITS = 24;

function hash3(text, i) {
  return (
    (Math.imul(text.charCodeAt(i), 0x9e3779b1) ^
      Math.imul(text.charCodeAt(i + 1), 0x85ebca77) ^
      Math.imul(text.charCodeAt(i + 2), 0xc2b2ae3d)) >>>
    (32 - FILTER_BITS)
  );
}

/**
 * Finds the fragments of `byFragment` in a string.
 * A bitmap of each fragment's first three characters skips most positions without slicing.
 */
export class FragmentMatcher {
  constructor(byFragment) {
    this.byFragment = byFragment;
    this.filter = new Uint8Array(1 << (FILTER_BITS - 3));
    this.lengths = [];
    for (const fragment of byFragment.keys()) {
      const bit = hash3(fragment, 0);
      this.filter[bit >> 3] |= 1 << (bit & 7);
      if (!this.lengths.includes(fragment.length)) {
        this.lengths.push(fragment.length);
      }
    }
    this.lengths.sort((a, b) => b - a);
    this.shortest = Math.min(...this.lengths);
  }

  /**
   * The matched ranges as merged [start, end) pairs, each with the name of a secret it came from.
   */
  find(text) {
    const ranges = [];
    if (this.byFragment.size === 0) {
      return ranges;
    }
    for (let i = 0; i + this.shortest <= text.length; i++) {
      const bit = hash3(text, i);
      if ((this.filter[bit >> 3] & (1 << (bit & 7))) === 0) {
        continue;
      }
      for (const length of this.lengths) {
        const name =
          i + length <= text.length
            ? this.byFragment.get(text.slice(i, i + length))
            : undefined;
        if (name !== undefined) {
          const last = ranges[ranges.length - 1];
          if (last && i <= last.end) {
            last.end = Math.max(last.end, i + length);
          } else {
            ranges.push({ start: i, end: i + length, name });
          }
          break;
        }
      }
    }
    return ranges;
  }
}

export function textMatcher(secrets) {
  return new FragmentMatcher(fragments(secrets));
}

// Binary files are searched as latin1 strings of their bytes, so the fragments are spelled as their UTF-8 bytes too.
export function byteMatcher(secrets) {
  return new FragmentMatcher(
    fragments(secrets, (text) => Buffer.from(text, "utf8").toString("latin1")),
  );
}

export function newCounts() {
  return Object.fromEntries(RULES.map((rule) => [rule, 0]));
}

/**
 * Applies every rule to one string, adding what it replaced to `counts`,
 * and the secret replacements to `bySecret` by secret name.
 */
export function scrubString(
  text,
  matcher,
  counts,
  bySecret = Object.create(null),
) {
  let result = text;
  const ranges = matcher.find(result);
  if (ranges.length > 0) {
    let pieces = "";
    let from = 0;
    for (const { start, end, name } of ranges) {
      pieces += result.slice(from, start) + PLACEHOLDER;
      from = end;
      bySecret[name] = (bySecret[name] ?? 0) + 1;
    }
    result = pieces + result.slice(from);
    counts.secret += ranges.length;
  }
  for (const { rule, pattern } of TOKEN_RULES) {
    result = result.replace(pattern, () => {
      counts[rule] += 1;
      return PLACEHOLDER;
    });
  }
  return result;
}

// Replaces in every string and key of a parsed JSON value, in place where it can.
function scrubJsonValue(value, scrub) {
  if (typeof value === "string") {
    return scrub(value);
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = scrubJsonValue(value[i], scrub);
    }
    return value;
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      const item = scrubJsonValue(value[key], scrub);
      const scrubbedKey = scrub(key);
      if (scrubbedKey !== key) {
        delete value[key];
      }
      value[scrubbedKey] = item;
    }
  }
  return value;
}

function total(counts) {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

// JSON is scrubbed value by value and written back with JSON.stringify, so it stays valid.
// Text that doesn't parse is scrubbed as plain text.
function scrubJsonText(text, scrub, stats) {
  try {
    return JSON.stringify(scrubJsonValue(JSON.parse(text), scrub));
  } catch {
    stats.unparsedJson += 1;
    return scrub(text);
  }
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

function readText(buffer) {
  if (buffer.includes(0)) {
    return null;
  }
  try {
    return utf8.decode(buffer);
  } catch {
    return null;
  }
}

/**
 * Every file and link under `dir`, with its path relative to `dir`.
 */
function walk(dir, prefix = "") {
  const entries = [];
  for (const name of fs.readdirSync(path.join(dir, prefix)).sort()) {
    const relative = path.join(prefix, name);
    const stat = fs.lstatSync(path.join(dir, relative));
    if (stat.isDirectory()) {
      entries.push(...walk(dir, relative));
    } else {
      entries.push({ relative, regular: stat.isFile() });
    }
  }
  return entries;
}

/**
 * Scrubs every text file under `dir` in place. Binary files are left alone for verifyDir to check.
 */
export function scrubDir(dir, secrets) {
  const matcher = textMatcher(secrets);
  const counts = newCounts();
  const bySecret = Object.create(null);
  const stats = {
    files: 0,
    textFiles: 0,
    binaryFiles: 0,
    changedFiles: 0,
    unparsedJson: 0,
    counts,
    bySecret,
  };
  const scrub = (text) =>
    text.length < SHORTEST_MATCH
      ? text
      : scrubString(text, matcher, counts, bySecret);
  for (const { relative, regular } of walk(dir)) {
    if (!regular) {
      continue;
    }
    stats.files += 1;
    const file = path.join(dir, relative);
    const extension = path.extname(relative);
    const text = BINARY_EXTENSIONS.has(extension)
      ? null
      : readText(fs.readFileSync(file));
    if (text === null) {
      stats.binaryFiles += 1;
      continue;
    }
    stats.textFiles += 1;
    const before = total(counts);
    let scrubbed;
    if (extension === ".json") {
      scrubbed = scrubJsonText(text, scrub, stats);
    } else if (extension === ".jsonl") {
      scrubbed = text
        .split("\n")
        .map((line) => (line ? scrubJsonText(line, scrub, stats) : line))
        .join("\n");
    } else {
      scrubbed = scrub(text);
    }
    if (total(counts) > before) {
      fs.writeFileSync(file, scrubbed);
      stats.changedFiles += 1;
    }
  }
  return stats;
}

/**
 * Looks for anything scrubDir should have replaced: any form of a secret in any file, text or binary,
 * and a token shape in any text file or file name. Anything that isn't a regular file or a directory counts too.
 */
export function verifyDir(dir, secrets) {
  const bytes = byteMatcher(secrets);
  const names = textMatcher(secrets);
  const leftovers = [];
  let files = 0;
  const check = (relative, rule, name) =>
    leftovers.push({ file: relative, rule, ...(name && { name }) });
  const checkText = (relative, text, matcher) => {
    const [found] = matcher.find(text);
    if (found) {
      check(relative, "secret", found.name);
    }
    for (const { rule, pattern } of TOKEN_RULES) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        check(relative, rule);
      }
    }
  };
  for (const { relative, regular } of walk(dir)) {
    checkText(`${relative} (name)`, relative, names);
    if (!regular) {
      check(relative, "not a regular file");
      continue;
    }
    files += 1;
    const buffer = fs.readFileSync(path.join(dir, relative));
    const text = BINARY_EXTENSIONS.has(path.extname(relative))
      ? null
      : readText(buffer);
    if (text === null) {
      const [found] = bytes.find(buffer.toString("latin1"));
      if (found) {
        check(relative, "secret", found.name);
      }
    } else {
      checkText(relative, text, names);
    }
  }
  return { ok: leftovers.length === 0, files, leftovers };
}

export function report({ parsed, scrubbed, verified }) {
  const byName = Object.entries(scrubbed.bySecret)
    .sort(([nameA, a], [nameB, b]) => b - a || nameA.localeCompare(nameB))
    .map(([name, n]) => `${name} ${n}`);
  const lines = [
    `secrets: ${parsed.secrets.length} values from ${parsed.names} secrets, ` +
      `${parsed.short} secrets left out as shorter than ${MIN_SECRET_LENGTH} characters`,
    `scrub: ${scrubbed.files} files, ${scrubbed.textFiles} text and ${scrubbed.binaryFiles} binary, ` +
      `${scrubbed.changedFiles} changed, ${scrubbed.unparsedJson} JSON files or lines scrubbed as plain text`,
    `replacements: ${RULES.map((rule) => `${rule} ${scrubbed.counts[rule]}`).join(", ")}`,
    `secret replacements by name: ${byName.length > 0 ? byName.join(", ") : "none"}`,
    `verify: ${verified.ok ? "pass" : "FAIL"}, ${verified.files} files checked, ${verified.leftovers.length} leftovers`,
  ];
  for (const { file, rule, name } of verified.leftovers.slice(0, MAX_LISTED)) {
    lines.push(`  ${file}: ${rule}${name ? ` (${name})` : ""}`);
  }
  if (verified.leftovers.length > MAX_LISTED) {
    lines.push(`  ... and ${verified.leftovers.length - MAX_LISTED} more`);
  }
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir] = process.argv.slice(2);
  if (!dir || !fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(
      "Usage: JOURNEY_SCRUB_SECRETS='{...}' node e2e/coverage/journey-capture-scrub.mjs <raw dir>",
    );
    process.exit(2);
  }
  let parsed;
  try {
    parsed = parseSecrets(process.env.JOURNEY_SCRUB_SECRETS);
  } catch {
    // A JSON.parse error quotes the text around the problem, which here is secrets.
    console.error("JOURNEY_SCRUB_SECRETS is not a JSON object of secrets");
    process.exit(2);
  }
  // The runner always has GITHUB_TOKEN, so no usable value means the secrets never reached this step.
  if (parsed.secrets.length === 0) {
    console.error("JOURNEY_SCRUB_SECRETS holds no secret to scrub");
    process.exit(2);
  }
  const scrubbed = scrubDir(dir, parsed.secrets);
  const verified = verifyDir(dir, parsed.secrets);
  console.log(report({ parsed, scrubbed, verified }));
  process.exit(verified.ok ? 0 : 1);
}
