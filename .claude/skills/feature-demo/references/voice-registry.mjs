// Local voice registry for the feature-demo skill.
//
// Caches Replicate /v1/files uploads keyed by content hash so repeated demos
// against the same reference WAV don't re-upload every time. Also stores
// named voices ("ngoc", "alice") so a storyboard can reference a voice by
// name instead of a filesystem path.
//
// Registry file: ~/.metabase-feature-demo/voices.json
// Voice samples: ~/.metabase-feature-demo/voices/<name>.wav  (copied at registration)
//
// Replicate file URLs expire in 24 hours. We refresh when expires_at is in
// the past — or within a 1-hour safety margin.

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
} from "fs";
import { createHash } from "crypto";
import { homedir } from "os";
import { join, basename, resolve } from "path";

const ROOT = join(homedir(), ".metabase-feature-demo");
const SAMPLES_DIR = join(ROOT, "voices");
const REGISTRY_PATH = join(ROOT, "voices.json");
const REFRESH_MARGIN_MS = 60 * 60 * 1000; // refresh if URL expires within 1h

function ensureDirs() {
  mkdirSync(SAMPLES_DIR, { recursive: true });
}

function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) return { default_name: null, voices: {} };
  return JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
}

function saveRegistry(reg) {
  ensureDirs();
  writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));
}

function hashFile(path) {
  return "sha256:" + createHash("sha256").update(readFileSync(path)).digest("hex");
}

function isFresh(entry) {
  if (!entry?.replicate_url || !entry?.expires_at) return false;
  const expiresMs = new Date(entry.expires_at).getTime();
  return expiresMs - Date.now() > REFRESH_MARGIN_MS;
}

async function uploadToReplicate(refPath, token) {
  const fd = new FormData();
  fd.append(
    "content",
    new Blob([readFileSync(refPath)], { type: "audio/wav" }),
    basename(refPath),
  );
  const res = await fetch("https://api.replicate.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Token ${token}` },
    body: fd,
  });
  const j = await res.json();
  if (!j.urls?.get) throw new Error(`Upload failed: ${JSON.stringify(j)}`);
  return { url: j.urls.get, expires_at: j.expires_at };
}

/**
 * Resolve a voice to a Replicate URL, uploading if needed.
 *
 * Accepts either:
 *   - a path to a WAV (ad-hoc; cached by content hash)
 *   - a registered name ("ngoc")
 *   - null/undefined → falls back to the default name, or
 *     REPLICATE_TTS_REF_AUDIO env var, or ~/tmp/voice-ref.wav.
 */
export async function resolveVoice(nameOrPath, { token } = {}) {
  token = token || process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN not set");

  ensureDirs();
  const reg = loadRegistry();

  // 1. Figure out the actual file path + the registry key to store under.
  let path, name;
  if (!nameOrPath) {
    nameOrPath =
      reg.default_name ||
      process.env.REPLICATE_TTS_REF_AUDIO ||
      join(homedir(), "tmp/voice-ref.wav");
  }
  if (reg.voices[nameOrPath]) {
    name = nameOrPath;
    path = resolve(reg.voices[nameOrPath].ref_path);
  } else {
    path = resolve(nameOrPath);
    name = null; // ad-hoc; we'll key the registry entry by hash
  }
  if (!existsSync(path)) {
    throw new Error(`Reference audio not found: ${path}`);
  }

  // 2. Hash + lookup.
  const hash = hashFile(path);
  const key = name || hash.slice(7, 19); // "sha256:abc…" → 12-char id

  if (reg.voices[key]?.ref_hash === hash && isFresh(reg.voices[key])) {
    return { url: reg.voices[key].replicate_url, cached: true, name: key };
  }

  // 3. Upload + persist.
  const { url, expires_at } = await uploadToReplicate(path, token);
  reg.voices[key] = {
    ...reg.voices[key],
    ref_path: path,
    ref_hash: hash,
    replicate_url: url,
    expires_at,
    uploaded_at: new Date().toISOString(),
  };
  saveRegistry(reg);
  return { url, cached: false, name: key };
}

/**
 * Register a named voice. Copies the WAV into the registry's sample dir so
 * the entry survives the original file being moved/deleted. Does NOT upload
 * immediately — the next tts/preview call against this name will upload.
 */
export function register(name, srcPath, { knobs = {} } = {}) {
  if (!/^[a-z0-9_-]+$/i.test(name)) {
    throw new Error(`Invalid name "${name}". Use letters, digits, -, _.`);
  }
  const src = resolve(srcPath);
  if (!existsSync(src)) throw new Error(`Source not found: ${src}`);

  ensureDirs();
  const dest = join(SAMPLES_DIR, `${name}.wav`);
  copyFileSync(src, dest);

  const reg = loadRegistry();
  reg.voices[name] = {
    ref_path: dest,
    ref_hash: hashFile(dest),
    knobs,
    // replicate_url / expires_at populated on first resolveVoice() call
  };
  if (!reg.default_name) reg.default_name = name;
  saveRegistry(reg);
  return reg.voices[name];
}

export function remove(name) {
  const reg = loadRegistry();
  if (!reg.voices[name]) throw new Error(`No voice named "${name}"`);
  delete reg.voices[name];
  if (reg.default_name === name) reg.default_name = Object.keys(reg.voices)[0] || null;
  saveRegistry(reg);
}

export function setDefault(name) {
  const reg = loadRegistry();
  if (!reg.voices[name]) throw new Error(`No voice named "${name}"`);
  reg.default_name = name;
  saveRegistry(reg);
}

export function list() {
  const reg = loadRegistry();
  return {
    default_name: reg.default_name,
    voices: Object.entries(reg.voices).map(([name, v]) => ({
      name,
      ref_path: v.ref_path,
      uploaded_at: v.uploaded_at || null,
      expires_at: v.expires_at || null,
      fresh: isFresh(v),
      knobs: v.knobs || {},
    })),
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────
//
// Usage:
//   node voice-registry.mjs list
//   node voice-registry.mjs register <name> <wav-path> [--knob exaggeration=0.6 ...]
//   node voice-registry.mjs remove <name>
//   node voice-registry.mjs default <name>
//   node voice-registry.mjs resolve [name-or-path]

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , cmd, ...rest] = process.argv;
  try {
    if (cmd === "list") {
      const out = list();
      if (out.voices.length === 0) {
        console.log("(no voices registered)");
      } else {
        console.log(`default: ${out.default_name || "(none)"}\n`);
        for (const v of out.voices) {
          const status = v.fresh ? "fresh" : v.expires_at ? "stale (will re-upload)" : "not uploaded yet";
          console.log(`• ${v.name}  ${v.ref_path}  [${status}]`);
          if (Object.keys(v.knobs).length) console.log(`    knobs: ${JSON.stringify(v.knobs)}`);
        }
      }
    } else if (cmd === "register") {
      const [name, path, ...flags] = rest;
      if (!name || !path) throw new Error("Usage: register <name> <path> [--knob k=v ...]");
      const knobs = {};
      for (let i = 0; i < flags.length; i++) {
        if (flags[i] === "--knob") {
          const [k, v] = flags[++i].split("=");
          knobs[k] = isNaN(+v) ? v : +v;
        }
      }
      register(name, path, { knobs });
      console.log(`Registered "${name}" from ${path}.`);
    } else if (cmd === "remove") {
      const [name] = rest;
      remove(name);
      console.log(`Removed "${name}".`);
    } else if (cmd === "default") {
      const [name] = rest;
      setDefault(name);
      console.log(`Default voice → "${name}".`);
    } else if (cmd === "resolve") {
      const r = await resolveVoice(rest[0]);
      console.log(`${r.url}  [${r.cached ? "cached" : "uploaded"} as ${r.name}]`);
    } else {
      console.log("Commands: list, register <name> <path>, remove <name>, default <name>, resolve [name|path]");
      process.exit(1);
    }
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
}
