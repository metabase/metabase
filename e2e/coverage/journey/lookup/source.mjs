// Reads source at the capture commit and finds the functions and top-level forms around a line.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

export function gitShow(repo, sha, file) {
  try {
    return execFileSync("git", ["-C", repo, "show", `${sha}:${file}`], {
      encoding: "utf8",
      maxBuffer: 1 << 28,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

let tsModule = null;
function typescript(repo) {
  if (!tsModule) {
    tsModule = createRequire(path.join(repo, "package.json"))("typescript");
  }
  return tsModule;
}

const JS_EXTENSIONS = /\.(m|c)?(j|t)sx?$/;
export const isJsFile = (file) => JS_EXTENSIONS.test(file);
export const isCljFile = (file) => /\.clj[cs]?$/.test(file);

/**
 * Every function Istanbul counts in a JS or TS file, with the position Istanbul records for it:
 * the name of a named function declaration or expression, otherwise the start of the function.
 */
export function listJsFunctions(repo, file, source) {
  const ts = typescript(repo);
  const kind = file.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : file.endsWith(".ts")
      ? ts.ScriptKind.TS
      : file.endsWith(".jsx")
        ? ts.ScriptKind.JSX
        : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const position = (pos) => {
    const { line, character } = sf.getLineAndCharacterOfPosition(pos);
    return { line: line + 1, column: character };
  };
  const nameOf = (node) => {
    if (
      node.name &&
      (ts.isIdentifier(node.name) || ts.isPrivateIdentifier(node.name))
    ) {
      return node.name.text;
    }
    if (
      node.name &&
      (ts.isStringLiteral(node.name) || ts.isNumericLiteral(node.name))
    ) {
      return node.name.text;
    }
    const parent = node.parent;
    if (
      parent &&
      ts.isVariableDeclaration(parent) &&
      ts.isIdentifier(parent.name)
    ) {
      return parent.name.text;
    }
    if (
      parent &&
      (ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) &&
      parent.name
    ) {
      return parent.name.getText(sf);
    }
    if (
      parent &&
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      return parent.left.getText(sf);
    }
    return null;
  };
  // Call wrappers such as memo(), forwardRef() and connect()(...) keep the variable's name.
  const wrappedName = (node) => {
    let current = node.parent;
    const calls = [];
    while (current && ts.isCallExpression(current)) {
      const callee = current.expression;
      const wrapper =
        ts.isIdentifier(callee) ||
        ts.isCallExpression(callee) ||
        (ts.isPropertyAccessExpression(callee) &&
          /^(memo|forwardRef)$/.test(callee.name.text));
      calls.push(callee.getText(sf).replace(/\s+/g, " ").slice(0, 40));
      if (!wrapper) {
        return { name: null, via: calls[0] };
      }
      if (
        current.parent &&
        ts.isVariableDeclaration(current.parent) &&
        ts.isIdentifier(current.parent.name)
      ) {
        return { name: current.parent.name.text, via: calls[0] };
      }
      current = current.parent;
    }
    return calls.length ? { name: null, via: calls[0] } : null;
  };
  const functions = [];
  function visit(node, outer) {
    let next = outer;
    if (ts.isFunctionLike(node) && node.body) {
      const ownName = nameOf(node);
      const wrapped = ownName ? null : wrappedName(node);
      const named =
        (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) &&
        node.name;
      const decl = position(named ? node.name.getStart(sf) : node.getStart(sf));
      const start = position(node.getStart(sf));
      const end = position(node.getEnd());
      let display = ownName ?? wrapped?.name;
      if (!display) {
        const via = wrapped?.via ? `${wrapped.via} callback` : "anonymous";
        display = `${outer?.display ?? "<module>"} > ${via}@${start.line}`;
      }
      const entry = {
        name: ownName ?? wrapped?.name ?? null,
        display,
        line: decl.line,
        column: decl.column,
        startLine: start.line,
        startColumn: start.column,
        endLine: end.line,
        outer: outer ?? null,
      };
      functions.push(entry);
      next = entry;
    }
    ts.forEachChild(node, (child) => visit(child, next));
  }
  visit(sf, null);
  return functions;
}

/** The innermost function around each line, or null for module-level code. */
export function enclosingJsFunction(functions, line) {
  let best = null;
  for (const fn of functions) {
    if (fn.startLine <= line && line <= fn.endLine) {
      if (!best || fn.endLine - fn.startLine < best.endLine - best.startLine) {
        best = fn;
      }
    }
  }
  return best;
}

/** Matches a parsed function to its fnmap index, by Istanbul's recorded position. */
export function fnmapIndexFor(fileFnmap, fn) {
  if (!fileFnmap) {
    return null;
  }
  const entries = Object.entries(fileFnmap);
  const exact = entries.find(
    ([, e]) => e.line === fn.line && e.column === fn.column,
  );
  if (exact) {
    return exact[0];
  }
  const start = entries.find(
    ([, e]) => e.line === fn.startLine && e.column === fn.startColumn,
  );
  if (start) {
    return start[0];
  }
  const sameLine = entries
    .filter(([, e]) => e.line === fn.line || e.line === fn.startLine)
    .sort(
      ([, a], [, b]) =>
        Math.abs(a.column - fn.column) - Math.abs(b.column - fn.column),
    );
  return sameLine.length === 1 ? sameLine[0][0] : null;
}

/**
 * Top-level forms of a Clojure file with their line ranges.
 * Strings, comments, character literals and regexes are skipped so their brackets don't count.
 */
export function listCljForms(source) {
  const forms = [];
  let depth = 0;
  let line = 1;
  let start = null;
  let startIndex = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\n") {
      line += 1;
      continue;
    }
    if (ch === ";") {
      while (i < source.length && source[i] !== "\n") {
        i++;
      }
      i--;
      continue;
    }
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === '"') {
      i++;
      while (i < source.length && source[i] !== '"') {
        if (source[i] === "\\") {
          i++;
        } else if (source[i] === "\n") {
          line += 1;
        }
        i++;
      }
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      if (depth === 0) {
        start = line;
        startIndex = i;
      }
      depth++;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0 && start !== null) {
        forms.push({
          startLine: start,
          endLine: line,
          head: formHead(source.slice(startIndex, i + 1)),
        });
        start = null;
      }
    }
  }
  return forms;
}

const DEF_HEADS =
  /^(?:[\w.-]+\/)?(defn-?|defmacro|def|defonce|defsetting|defenterprise|defenterprise-schema|defmulti|defsetting|defprotocol|defrecord|deftype|defschema|define-[\w-]+|deftest|defendpoint|defmethod)$/;

function formHead(text) {
  // Drop reader metadata so `(defn ^:private foo` and `(def ^{:doc ...} foo` give the name.
  const tokens = [];
  const re = /\^\{[^}]*\}|\^[:\w.-]+|"(?:[^"\\]|\\.)*"|[^\s()[\]{}"]+/g;
  const body = text.slice(1);
  let m;
  while ((m = re.exec(body)) && tokens.length < 4) {
    if (m[0].startsWith("^")) {
      continue;
    }
    tokens.push(m[0]);
  }
  const [op, ...rest] = tokens;
  if (!op || !DEF_HEADS.test(op)) {
    return { op: op ?? null, kind: "other" };
  }
  const base = op.split("/").pop();
  if (base === "defmethod") {
    return { op, kind: "defmethod", multi: rest[0], dispatch: rest[1] };
  }
  if (base === "defendpoint") {
    return {
      op,
      kind: "endpoint",
      method: rest[0],
      route: rest[1]?.replace(/^"|"$/g, ""),
    };
  }
  return { op, kind: "def", name: rest[0] };
}

export function enclosingCljForm(forms, line) {
  return (
    forms.find((form) => form.startLine <= line && line <= form.endLine) ?? null
  );
}

const MUNGE = {
  "-": "_",
  ":": "_COLON_",
  "+": "_PLUS_",
  ">": "_GT_",
  "<": "_LT_",
  "=": "_EQ_",
  "~": "_TILDE_",
  "!": "_BANG_",
  "@": "_CIRCA_",
  "#": "_SHARP_",
  "'": "_SINGLEQUOTE_",
  '"': "_DOUBLEQUOTE_",
  "%": "_PERCENT_",
  "^": "_CARET_",
  "&": "_AMPERSAND_",
  "*": "_STAR_",
  "|": "_BAR_",
  "{": "_LBRACE_",
  "}": "_RBRACE_",
  "[": "_LBRACK_",
  "]": "_RBRACK_",
  "/": "_SLASH_",
  "\\": "_BSLASH_",
  "?": "_QMARK_",
};

export const munge = (name) => [...name].map((ch) => MUNGE[ch] ?? ch).join("");
export const nsClassPrefix = (ns) =>
  ns
    .split(".")
    .map((part) => part.replace(/-/g, "_"))
    .join("/");

export function nsOfCljFile(source) {
  return (
    source.match(/\(ns\s+(?:\^\{[^}]*\}\s+|\^:[\w-]+\s+)*([\w.-]+)/)?.[1] ??
    null
  );
}
