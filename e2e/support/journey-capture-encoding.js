/**
 * Encodes request bodies and branch counters for journey-capture runs, in the format described in e2e/journey-capture/README.md.
 */

const SECRET_KEY = /password|token|secret|session/i;
const MASK = "<masked>";
export const MAX_BODY_TEXT = 2048;

/**
 * FNV-1a 64 of the UTF-8 bytes of `text`, as 16 hex digits, and the number of bytes.
 */
export function hashText(text) {
  // The 64-bit state is four 16-bit limbs, lowest first, so every product stays exact in a double.
  let h0 = 0x2325;
  let h1 = 0x8422;
  let h2 = 0x9ce4;
  let h3 = 0xcbf2;
  let bytes = 0;
  const feed = (byte) => {
    h0 ^= byte;
    // Multiplies by the FNV prime, 2^40 + 0x1b3.
    const t0 = h0 * 0x1b3;
    let t1 = h1 * 0x1b3;
    let t2 = h2 * 0x1b3 + (h0 << 8);
    let t3 = h3 * 0x1b3 + (h1 << 8);
    t1 += t0 >>> 16;
    h0 = t0 & 0xffff;
    t2 += t1 >>> 16;
    h1 = t1 & 0xffff;
    t3 += t2 >>> 16;
    h2 = t2 & 0xffff;
    h3 = t3 & 0xffff;
    bytes += 1;
  };
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code < 0xdc00 && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next < 0xe000) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    // A lone surrogate encodes as U+FFFD, the same as TextEncoder.
    if (code >= 0xd800 && code < 0xe000) {
      code = 0xfffd;
    }
    if (code < 0x80) {
      feed(code);
    } else if (code < 0x800) {
      feed(0xc0 | (code >> 6));
      feed(0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      feed(0xe0 | (code >> 12));
      feed(0x80 | ((code >> 6) & 0x3f));
      feed(0x80 | (code & 0x3f));
    } else {
      feed(0xf0 | (code >> 18));
      feed(0x80 | ((code >> 12) & 0x3f));
      feed(0x80 | ((code >> 6) & 0x3f));
      feed(0x80 | (code & 0x3f));
    }
  }
  const hash = [h3, h2, h1, h0]
    .map((limb) => limb.toString(16).padStart(4, "0"))
    .join("");
  return { hash, bytes };
}

// "Object" and "Array" are plain JSON values, anything else (FormData, Blob, ArrayBuffer, ...) is recorded by type only.
// Binary bodies are checked first, because a Buffer's toJSON() would turn it into a list of numbers.
function nonJsonType(value) {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const tag = Object.prototype.toString.call(value).slice(8, -1);
  if (ArrayBuffer.isView(value) || tag === "ArrayBuffer") {
    return tag;
  }
  if (typeof value.toJSON === "function") {
    return null;
  }
  return tag === "Object" || tag === "Array" ? null : tag;
}

// The app makes these up for each query or dashboard load, so the same request carries new ones every time:
// MBQL clause ids, dashboard load ids and native template tag ids.
const MADE_UP_ID_KEYS = new Set(["lib/uuid", "dashboard_load_id"]);

// `role` is "tags" for the `template-tags` object and "tag" for each template tag in it.
function collectMadeUpIds(value, ids, ancestors, role = null) {
  if (value === null || typeof value !== "object" || ancestors.has(value)) {
    return;
  }
  if (typeof value.toJSON === "function") {
    collectMadeUpIds(value.toJSON(), ids, ancestors, role);
    return;
  }
  ancestors.add(value);
  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item === "string" &&
      (MADE_UP_ID_KEYS.has(key) || (role === "tag" && key === "id"))
    ) {
      ids.add(item);
    }
    const childRole =
      role === "tags" ? "tag" : key === "template-tags" ? "tags" : null;
    collectMadeUpIds(item, ids, ancestors, childRole);
  }
  ancestors.delete(value);
}

function canonical(value, ancestors, madeUp) {
  if (value === null) {
    return "null";
  }
  if (typeof value === "bigint") {
    return String(value);
  }
  if (typeof value !== "object") {
    if (typeof value === "string" && madeUp.ids.has(value)) {
      let n = madeUp.numbers.get(value);
      if (n === undefined) {
        n = madeUp.numbers.size + 1;
        madeUp.numbers.set(value, n);
      }
      return JSON.stringify(`<id ${n}>`);
    }
    return JSON.stringify(value);
  }
  if (typeof value.toJSON === "function") {
    return canonical(value.toJSON(), ancestors, madeUp);
  }
  if (ancestors.has(value)) {
    return JSON.stringify("<cycle>");
  }
  ancestors.add(value);
  let text;
  if (Array.isArray(value)) {
    const items = value.map(
      (item) => canonical(item, ancestors, madeUp) ?? "null",
    );
    text = `[${items.join(",")}]`;
  } else {
    const members = [];
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item === undefined || typeof item === "function") {
        continue;
      }
      const encoded = SECRET_KEY.test(key)
        ? JSON.stringify(MASK)
        : canonical(item, ancestors, madeUp);
      if (encoded !== undefined) {
        members.push(`${JSON.stringify(key)}:${encoded}`);
      }
    }
    text = `{${members.join(",")}}`;
  }
  ancestors.delete(value);
  return text;
}

// Made-up ids become `<id 1>`, `<id 2>` and so on, numbered in the order they first appear, so a reference to one keeps pointing at it.
function canonicalValue(value) {
  const ids = new Set();
  collectMadeUpIds(value, ids, new Set());
  return canonical(value, new Set(), { ids, numbers: new Map() });
}

function maskFormFields(text) {
  return text.replace(
    /(^|&)([^=&]*(?:password|token|secret|session)[^=&]*)=[^&]*/gi,
    `$1$2=${MASK}`,
  );
}

/**
 * JSON with object keys sorted, the values of keys matching password, token, secret or session masked,
 * and the ids the app makes up for each request numbered in order of appearance.
 * A string that holds a JSON object or array is canonicalized as that value, other strings get their matching form fields masked.
 */
export function canonicalBody(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return canonicalValue(JSON.parse(trimmed));
      } catch {
        // Not JSON after all.
      }
    }
    return JSON.stringify(maskFormFields(value));
  }
  return canonicalValue(value);
}

function hashFields(text) {
  const { hash, bytes } = hashText(text);
  return { bodyHash: hash, bodyBytes: bytes };
}

/**
 * The event fields for a `cy.request` body: its canonical form clipped to MAX_BODY_TEXT characters,
 * and the hash and UTF-8 length of the whole canonical form.
 */
export function requestBodyFields(body) {
  if (body === undefined) {
    return {};
  }
  const type = nonJsonType(body);
  if (type) {
    return { bodyType: type };
  }
  const text = canonicalBody(body);
  if (text === undefined) {
    return { bodyType: typeof body };
  }
  return {
    body:
      text.length > MAX_BODY_TEXT ? `${text.slice(0, MAX_BODY_TEXT)}…` : text,
    ...hashFields(text),
  };
}

/**
 * requestBodyFields under the names `<prefix>`, `<prefix>Hash`, `<prefix>Bytes` and `<prefix>Type`.
 */
export function payloadFields(value, prefix) {
  return Object.fromEntries(
    Object.entries(requestBodyFields(value)).map(([key, field]) => [
      prefix + key.slice("body".length),
      field,
    ]),
  );
}

// Picks the reply out of cy.intercept's arguments: (matcher), (method, url), (matcher, reply), (method, url, reply) or (url, matcher, reply).
export function interceptReplyArg(args, isMethod) {
  if (args.length >= 3) {
    return args[2];
  }
  return args.length === 2 && !isMethod(args[0]) ? args[1] : undefined;
}

// Picks the body out of cy.request's arguments the way Cypress does: (url), (url, body), (method, url), (method, url, body) or (options).
export function requestBodyArg(args, isMethod) {
  const [first, second, third] = args;
  if (first !== null && typeof first === "object") {
    return Object.prototype.hasOwnProperty.call(first, "body")
      ? first.body
      : undefined;
  }
  if (args.length === 2) {
    return isMethod(first) ? undefined : second;
  }
  return args.length === 3 ? third : undefined;
}

/**
 * The event fields for a request body seen by a `cy.intercept` handler: the hash and UTF-8 length of its canonical form, as for `cy.request`.
 * Cypress hands the handler JSON bodies already parsed.
 */
export function proxyBodyFields(body, headers) {
  if (body === undefined || body === null || body === "") {
    return {};
  }
  if (typeof body === "string") {
    const contentType = Object.entries(headers ?? {}).find(
      ([name]) => name.toLowerCase() === "content-type",
    )?.[1];
    // Multipart bodies carry a random boundary, so their hash would differ on every request.
    if (/^multipart\//i.test(String(contentType ?? ""))) {
      return { bodyType: "multipart", bodyBytes: hashText(body).bytes };
    }
    return hashFields(canonicalBody(body));
  }
  const type = nonJsonType(body);
  if (type) {
    return { bodyType: type };
  }
  return hashFields(canonicalBody(body));
}

/**
 * Adds the arms that ran in one file's Istanbul branch counters to `hits`, summing with earlier calls for the same file.
 */
export function addBranchHits(hits, file, b) {
  for (const branch in b) {
    const counts = b[branch];
    for (let arm = 0; arm < counts.length; arm++) {
      const count = counts[arm];
      if (count > 0) {
        const branches = (hits[file] ??= {});
        const arms = (branches[branch] ??= []);
        arms[arm] = (arms[arm] ?? 0) + count;
      }
    }
  }
}

/**
 * Turns what addBranchHits collected into a file table and flat [fileIndex, branchIndex, armIndex, count] quads.
 */
export function flattenBranchHits(hits) {
  const files = [];
  const quads = [];
  for (const [file, branches] of Object.entries(hits)) {
    const fileIndex = files.push(file) - 1;
    for (const branch of Object.keys(branches)) {
      const arms = branches[branch];
      for (let arm = 0; arm < arms.length; arm++) {
        if (arms[arm] > 0) {
          quads.push(fileIndex, Number(branch), arm, arms[arm]);
        }
      }
    }
  }
  return { files, hits: quads };
}

/**
 * Rewrites each test's `branchHits` from its own file table to one file table for the whole spec, which it returns.
 */
export function indexBranchHits(tests) {
  const files = [];
  const indices = new Map();
  for (const test of tests) {
    const own = test.branchHits;
    if (!own || !Array.isArray(own.files) || !Array.isArray(own.hits)) {
      continue;
    }
    const remap = own.files.map((file) => {
      let index = indices.get(file);
      if (index === undefined) {
        index = files.push(file) - 1;
        indices.set(file, index);
      }
      return index;
    });
    const quads = own.hits.slice();
    for (let i = 0; i + 3 < quads.length; i += 4) {
      quads[i] = remap[quads[i]];
    }
    test.branchHits = quads;
  }
  return files;
}
