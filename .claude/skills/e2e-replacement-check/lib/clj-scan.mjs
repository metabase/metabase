import crypto from "node:crypto";

const TOKEN_RE =
  /(?<ws>[\s,]+)|(?<comment>;[^\n]*)|(?<str>"(?:\\.|[^"\\])*")|(?<regex>#"(?:\\.|[^"\\])*")|(?<char>\\(?:newline|space|tab|return|formfeed|backspace|u[0-9a-fA-F]{4}|o[0-7]{1,3}|.))|(?<open>#\{|#\(|#\?@?\(|#_|[([{])|(?<close>[)\]}])|(?<meta>\^)|(?<atom>[^\s,;"()[\]{}\\^]+)/g;
const READER_PREFIXES = new Set(["'", "`", "~", "~@", "@", "#'"]);
const DEF_HEADS = /^(def|defn-?|defmacro|defmulti|defonce|mu\/defn-?|mr\/def|defmethod)$/;
const DEFTEST_HEADS = new Set(["deftest", "t/deftest", "clojure.test/deftest"]);

const hash = (xs) => crypto.createHash("sha1").update(xs.join("\u0001")).digest("hex").slice(0, 16);

export function tokenize(src) {
  const out = [];
  for (const m of src.matchAll(TOKEN_RE)) {
    const kind = Object.keys(m.groups).find((k) => m.groups[k] !== undefined);
    if (kind !== "ws" && kind !== "comment") {
      out.push({ kind, text: m[0], pos: m.index });
    }
  }
  return out;
}

// Returns the index just past the form that starts at token `i`.
function formEnd(toks, i) {
  if (i >= toks.length) {
    return toks.length;
  }
  const { kind, text } = toks[i];
  if (kind === "open") {
    if (text === "#_") {
      return formEnd(toks, i + 1);
    }
    let depth = 0;
    for (let j = i; j < toks.length; j++) {
      if (toks[j].kind === "open" && toks[j].text !== "#_") {
        depth++;
      } else if (toks[j].kind === "close" && --depth === 0) {
        return j + 1;
      }
    }
    return toks.length;
  }
  if (kind === "meta") {
    return formEnd(toks, formEnd(toks, i + 1));
  }
  return READER_PREFIXES.has(text) ? formEnd(toks, i + 1) : i + 1;
}

function skipMeta(toks, k, end) {
  while (k < end && toks[k].kind === "meta") {
    k = formEnd(toks, k + 1);
  }
  return k;
}

// The namespaces an `ns` form's :require lists, as the first symbol of each vector or a bare symbol.
function requiresOf(toks, start, end) {
  const out = [];
  for (let k = start; k < end; k++) {
    if (toks[k].text !== "(" || toks[k + 1]?.text !== ":require") {
      continue;
    }
    const listEnd = formEnd(toks, k);
    for (let j = k + 2; j < listEnd - 1; j = formEnd(toks, j)) {
      const t = toks[j];
      if (t.text === "[" && toks[j + 1]?.kind === "atom") {
        out.push(toks[j + 1].text);
      } else if (t.kind === "atom" && !t.text.startsWith(":")) {
        out.push(t.text);
      }
    }
  }
  return out;
}

// Reads a Clojure test file into one record per deftest, with a hash of its body once aliases are expanded to namespaces,
// the file's own defs are qualified with its namespace and `::` keywords are made full, so equal hashes mean the same code.
export function scanClj(src, file) {
  const toks = tokenize(src);
  const lineOf = (pos) => src.slice(0, pos).split("\n").length;
  const tops = [];
  for (let i = 0; i < toks.length; i = formEnd(toks, i)) {
    tops.push([i, formEnd(toks, i)]);
  }
  const aliases = new Map();
  const local = new Set();
  let ns = null;
  let requires = [];
  for (const [a, b] of tops) {
    if (toks[a].text !== "(" || a + 1 >= b) {
      continue;
    }
    const head = toks[a + 1].text;
    if (head === "ns" && ns === null) {
      const k = skipMeta(toks, a + 2, b);
      ns = k < b ? toks[k].text : null;
      const seg = toks.slice(a, b).map((t) => t.text);
      for (let x = 1; x < seg.length - 2; x++) {
        if (seg[x + 1] === ":as" && seg[x - 1] === "[") {
          aliases.set(seg[x + 2], seg[x]);
        }
      }
      requires = requiresOf(toks, a, b);
    } else if (DEF_HEADS.test(head) && a + 2 < b) {
      const k = skipMeta(toks, a + 2, b);
      if (k < b) {
        local.add(toks[k].text);
      }
    }
  }
  const tests = [];
  for (const [a, b] of tops) {
    if (toks[a].text !== "(" || a + 2 >= b || !DEFTEST_HEADS.has(toks[a + 1].text)) {
      continue;
    }
    const k = skipMeta(toks, a + 2, b);
    const body = toks.slice(k + 1, b - 1);
    const norm = body.map(({ kind, text }) => {
      if (kind === "atom" && text.includes("/") && !text.startsWith(":") && aliases.has(text.split("/")[0])) {
        return `${aliases.get(text.split("/")[0])}/${text.slice(text.indexOf("/") + 1)}`;
      }
      if (kind === "atom" && local.has(text)) {
        return `${ns}/${text}`;
      }
      if (kind === "atom" && text.startsWith("::")) {
        return `:${ns}/${text.slice(2)}`;
      }
      return text;
    });
    tests.push({ file, line: lineOf(toks[a].pos), ns, name: toks[k].text, body: hash(norm), tokens: body.length });
  }
  return { ns, requires, tests };
}

export function findCljCopies(tests, involves) {
  const byBody = new Map();
  for (const t of tests) {
    byBody.set(t.body, [...(byBody.get(t.body) ?? []), t]);
  }
  const out = [];
  for (const group of byBody.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (involves(group[i]) || involves(group[j])) {
          out.push({ kind: "exact copy", a: group[i], b: group[j] });
        }
      }
    }
  }
  return out;
}
