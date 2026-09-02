#!/usr/bin/env node
import { readFileSync } from "node:fs";

const { BLOCKED_TAGS, GLOBAL_BLOCKED_EVENT_TYPES } = await import(
  "./references/blocklists.mjs"
);

const target = process.argv[2] ?? "src/index.tsx";
const alt = (list) => [...list].join("|");

const PATTERNS = [
  /\b(fetch|alert|confirm|prompt)\s*\(/g,
  /\bnew\s+(Worker|FontFace|Notification)\b/g,
  /\b(XMLHttpRequest|WebSocket|EventSource|SharedWorker|RTCPeerConnection|WebTransport|BroadcastChannel|PaymentRequest|PerformanceObserver|XSLTProcessor|DOMParser|localStorage|sessionStorage|indexedDB|cookieStore)\b/g,
  /\b(document\.cookie|document\.referrer|window\.open|window\.print)\b/g,
  /\.(sendBeacon|createContextualFragment|setHTMLUnsafe|parseHTMLUnsafe|execCommand|pushState|replaceState|requestFullscreen|showModal)\s*\(/g,
  new RegExp(`<(${alt(BLOCKED_TAGS)})(?=[\\s/>])`, "g"),
  new RegExp(
    `createElement(?:NS)?\\([^)]*["'\`](${alt(BLOCKED_TAGS)})["'\`]`,
    "g",
  ),
  new RegExp(
    `\\b(?:document|window)\\.addEventListener\\(\\s*["'\`](${alt(GLOBAL_BLOCKED_EVENT_TYPES)})["'\`]`,
    "g",
  ),
];

const lines = readFileSync(target, "utf-8")
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .split("\n")
  .map((line) => line.replace(/^\s*\/\/.*/, ""));

const findings = lines.flatMap((line, i) =>
  PATTERNS.flatMap((p) => [...line.matchAll(p)]).map(
    (m) => `${target}:${i + 1} blocked in sandbox: ${m[0]}`,
  ),
);

if (findings.length) {
  console.error(findings.join("\n"));
  console.error(
    `\n${findings.length} blocked-API reference(s). See references/sandbox-restrictions.md and references/sandbox-substitutes.md next to this script.`,
  );
  process.exit(1);
}
console.log(`verify-tokens: OK — no blocked sandbox tokens in ${target}`);
