// Turns one test attempt's events into a path of tokens, its Cypress commands and cy.request calls, and places its step cuts' code on that path.
// URL changes, app requests and assertion logs arrive asynchronously, so they stay out of the path and are kept per cut.
import { normalizePages } from "../../routes.mjs";

export const LEVELS = ["exact", "normalized"];

const normalizePathSegments = (p) => normalizePages([p])[0];

// Values that differ between two runs of the same test, masked at both levels.
const RANDOM_VALUES = [
  [/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>"],
  [/eyJ[\w-]*\.[\w-]+\.[\w-]*/g, "<jwt>"],
  [
    /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{1,2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT\b/g,
    "<date>",
  ],
  [
    /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/g,
    "<datetime>",
  ],
  [/\bmantine-[a-z0-9]{9}\b/g, "mantine-<id>"],
  [/__m__-[\w-]+/g, "__m__-<id>"],
  [/:r[0-9a-z]+:|«r[0-9a-z]+»/g, "<react-id>"],
  [/\b1[5-9]\d{11}\b/g, "<epoch-ms>"],
  [/\b1[5-9]\d{8}\b/g, "<epoch-s>"],
];

export function maskRandom(text) {
  let out = text;
  for (const [re, replacement] of RANDOM_VALUES) {
    out = out.replace(re, replacement);
  }
  return out;
}

const APP_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/;

// "/question/94-orders#edit&scrollTo=88" becomes "/question/:id#edit&scrollTo=N".
// Long base64 hashes are the ad-hoc question a visit opens.
export function normalizeUrl(value) {
  const url = value.replace(APP_ORIGIN, "");
  const cut = url.search(/[?#]/);
  const pathname = cut === -1 ? url : url.slice(0, cut);
  const rest = cut === -1 ? "" : url.slice(cut);
  const tail = /^#[A-Za-z0-9+/=_-]{24,}$/.test(rest)
    ? "#<hash>"
    : rest.replace(/\d+/g, "N");
  return (
    normalizePathSegments(pathname).replace(/\bcard__\d+/g, "card__:id") + tail
  );
}

const looksLikeUrl = (value) =>
  /^\//.test(value) || /^api\//.test(value) || APP_ORIGIN.test(value);

// Applies `inString` to the body of every double-quoted JSON string in a command chain, and `outside` to the text between them.
// Arguments are clipped at 300 characters, so an unterminated string runs to the end.
function mapChain(chain, inString, outside) {
  let out = "";
  let i = 0;
  let plainStart = 0;
  let previousString = null;
  while (i < chain.length) {
    if (chain[i] === '"') {
      out += outside(chain.slice(plainStart, i), previousString);
      const before = chain.slice(Math.max(0, i - 4), i);
      let j = i + 1;
      while (j < chain.length && chain[j] !== '"') {
        j += chain[j] === "\\" ? 2 : 1;
      }
      previousString = chain.slice(i + 1, j);
      out += '"' + inString(previousString, before) + '"';
      i = j + 1;
      plainStart = i;
    } else {
      i += 1;
    }
  }
  return out + outside(chain.slice(plainStart), previousString);
}

function normalizeString(value, before) {
  if (looksLikeUrl(value)) {
    return normalizeUrl(value);
  }
  // Alias names carry the fixture id ("cardQuery94").
  if (value.startsWith("@") || before.endsWith("as(")) {
    return value.replace(/\d+/g, "N");
  }
  return value;
}

// Keys and MBQL clauses whose numbers are entity ids: `{"table_id":204}`, `{"card_ids":[98,99]}`, `["field",2076,null]`.
const ID_KEY = /^(id|ids|database|source-table)$|[_-]ids?$|[a-z]Ids?$/;
const ID_CLAUSE = new Set([
  "field",
  "field-id",
  "segment",
  "metric",
  "measure",
]);

// Every other number is a test input (a viewport size, a typed value, a wait, a coordinate) and stays.
function maskIds(text, previousString) {
  if (previousString === null) {
    return text;
  }
  if (ID_KEY.test(previousString)) {
    return text.replace(
      /^(\s*:\s*)(\[[-\d.,\s]*\]|-?\d+(\.\d+)?)/,
      (all, colon, value) => colon + value.replace(/-?\d+(\.\d+)?/g, "<id>"),
    );
  }
  if (ID_CLAUSE.has(previousString)) {
    return text.replace(/^(\s*,\s*)\d+/, "$1<id>");
  }
  return text;
}

export function commandText(chain, level) {
  const masked = maskRandom(chain);
  if (level === "exact") {
    return mapChain(
      masked,
      (s) => s.replace(APP_ORIGIN, ""),
      (s) => s,
    );
  }
  return mapChain(masked, normalizeString, maskIds);
}

function urlText(value, level) {
  const masked = maskRandom(value).replace(APP_ORIGIN, "");
  return level === "exact" ? masked : normalizeUrl(masked);
}

// Codemirror's "ͼ1a" classes and per-render ids like "mantine-6qkjzmq08" change between runs, so they are dropped.
// CSS-module and Mantine class hashes are fixed for a build, so they stay and identify the component.
function elementText(tag, rest) {
  const parts = rest.match(/[#.][^#.]+/g) ?? [];
  const kept = parts.filter((part) => !/^\.ͼ/.test(part)).map(maskRandom);
  return `<${tag}${kept.join("")}>`;
}

export function assertionText(message, state, level) {
  let text = message.replace(
    /<([a-z][\w-]*)((?:[#.][^\s#.<>*]+)*)>/g,
    (all, tag, rest) => elementText(tag, rest),
  );
  text = maskRandom(text).replace(
    /https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/g,
    "",
  );
  if (level === "normalized") {
    text = text.replace(
      /\*\*(\/[^*\s]*)\*\*/g,
      (all, url) => `**${normalizeUrl(url)}**`,
    );
  }
  return state && state !== "passed" ? `[${state}] ${text}` : text;
}

// Plumbing and the recording's own commands: coverage hooks, logging, aliases and callbacks.
const DROPPED_COMMANDS = new Set([
  "log",
  "task",
  "within-restore",
  "end-logGroup",
  "then",
  "wrap",
  "as",
  "env",
]);

export function isDroppedCommand(event) {
  const chain = event.chain ?? "";
  return (
    DROPPED_COMMANDS.has(event.name) ||
    chain.startsWith('window({"log":false})') ||
    chain.startsWith("task(")
  );
}

function tokenText(event, level) {
  const prefix =
    event.phase && event.phase !== "test" ? `${event.phase}: ` : "";
  if (event.kind === "request") {
    return `${prefix}request ${event.method} ${urlText(event.path ?? "", level)}`;
  }
  return prefix + commandText(event.chain ?? event.name ?? "", level);
}

const shortHelper = (name) =>
  name.replace(/^Object\./, "").replace(/^Context\./, "");

// The outermost spec or support helper that queued the command, below the test or hook body.
function helperOf(event) {
  const helper = (event.helpers ?? []).slice(1).find((h) => h !== "eval");
  return helper ? shortHelper(helper) : null;
}

// A describe's `before` hooks run once, inside its first test, so only that test records their commands.
// `suitePrefix` counts the path tokens up to the last of them.
export function buildPath(events) {
  const tokens = [];
  let suitePrefix = 0;
  for (const event of events) {
    const isAction =
      (event.kind === "command" && !isDroppedCommand(event)) ||
      (event.kind === "request" && event.initiator === "cy.request");
    if (!isAction) {
      continue;
    }
    if (event.phase === "before all") {
      suitePrefix = tokens.length + 1;
    }
    tokens.push({
      seq: event.seq,
      phase: event.phase ?? "between",
      exact: tokenText(event, "exact"),
      normalized: tokenText(event, "normalized"),
      helper: helperOf(event),
      chain: event.kind === "command" ? (event.chain ?? null) : null,
    });
  }
  // A command whose chain the next command extends is not the end of a statement, and labels skip it.
  tokens.forEach((token, index) => {
    const next = tokens[index + 1];
    token.terminal = !(
      token.chain &&
      next?.chain &&
      next.chain.startsWith(token.chain)
    );
  });
  return { tokens, suitePrefix };
}

function appApiRequest(event) {
  return (
    event.kind === "request" &&
    (event.initiator === "fetch" || event.initiator === "xhr") &&
    (event.path ?? "").startsWith("/api/")
  );
}

// Each cut holds the code that ran since the previous cut, during events with seq in [previous cut, cut).
// `pos` is how many path tokens came before the cut, which places its code on the path.
export function placeCuts(events, cuts, tokens) {
  const byseq = new Map(events.map((e) => [e.seq, e]));
  const placed = cuts.map((cut) => ({
    cut,
    pos: 0,
    asserts: [],
    requests: new Set(),
    urls: [],
  }));
  let ci = 0;
  let orphans = 0;
  for (const event of events) {
    while (ci < cuts.length && cuts[ci].seq <= event.seq) {
      ci += 1;
    }
    if (ci >= cuts.length) {
      orphans += 1;
      continue;
    }
    const target = placed[ci];
    if (event.kind === "assert") {
      target.asserts.push({
        exact: assertionText(event.message ?? "", event.state, "exact"),
        normalized: assertionText(
          event.message ?? "",
          event.state,
          "normalized",
        ),
        chain: event.chain ?? "",
      });
    } else if (
      appApiRequest(event) ||
      (event.kind === "request" && event.initiator === "cy.request")
    ) {
      target.requests.add(`${event.method} ${event.path}`);
    } else if (event.kind === "nav") {
      target.urls.push(normalizeUrl(event.path ?? ""));
    }
  }
  let ti = 0;
  for (const entry of placed) {
    while (ti < tokens.length && tokens[ti].seq < entry.cut.seq) {
      ti += 1;
    }
    entry.pos = ti;
    const trigger = byseq.get(entry.cut.triggerSeq);
    entry.trigger = entry.cut.trigger;
    entry.triggerText =
      entry.cut.trigger === "assert" && trigger
        ? assertionText(trigger.message ?? "", trigger.state, "normalized")
        : trigger?.kind === "nav"
          ? normalizeUrl(trigger.path ?? "")
          : "";
    entry.requests = [...entry.requests];
  }
  return { placed, orphans };
}

// Where the recording would have cut, from the events alone: before a document load,
// after a URL change, after an assertion, and once at the end.
export function virtualCuts(events, mode = "assertions") {
  const cuts = [];
  for (const event of events) {
    if (event.kind === "nav" && event.how === "document") {
      cuts.push({
        seq: event.seq,
        trigger: "document",
        triggerSeq: event.seq,
        phase: event.phase,
      });
    } else if (event.kind === "nav") {
      cuts.push({
        seq: event.seq + 1,
        trigger: "nav",
        triggerSeq: event.seq,
        phase: event.phase,
      });
    } else if (event.kind === "assert" && mode !== "navigations") {
      cuts.push({
        seq: event.seq + 1,
        trigger: "assert",
        triggerSeq: event.seq,
        phase: event.phase,
      });
    } else if (event.kind === "command" && mode === "commands") {
      cuts.push({
        seq: event.seq + 1,
        trigger: "command",
        triggerSeq: event.seq,
        phase: event.phase,
      });
    }
  }
  const lastSeq = events.length ? events[events.length - 1].seq + 1 : 0;
  cuts.push({
    seq: lastSeq,
    trigger: "end",
    triggerSeq: null,
    phase: events.at(-1)?.phase ?? null,
  });
  return cuts;
}
