import fs from "node:fs";
import path from "node:path";

const ctx = { ts: null, root: null };

export function configure({ ts, root }) {
  ctx.ts = ts;
  ctx.root = root;
}

const API_DIRS = ["frontend/src/metabase/api", "enterprise/frontend/src/metabase-enterprise/api"];

export function parse(file) {
  const ts = ctx.ts;
  const text = fs.readFileSync(path.join(ctx.root, file), "utf8");
  const kind = file.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : file.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : file.endsWith(".js")
        ? ts.ScriptKind.JSX
        : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  return { text, sf };
}

function walk(node, fn) {
  const ts = ctx.ts;
  fn(node);
  ts.forEachChild(node, (child) => walk(child, fn));
}

const lineOf = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
const snippet = (s, n = 70) => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n - 1) + "…" : flat;
};

function valueImports(sf) {
  const ts = ctx.ts;
  const imports = new Map();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause || stmt.importClause.isTypeOnly) continue;
    const from = stmt.moduleSpecifier.text;
    const clause = stmt.importClause;
    if (clause.name) imports.set(clause.name.text, from);
    const nb = clause.namedBindings;
    if (nb && ts.isNamespaceImport(nb)) imports.set(nb.name.text, from);
    if (nb && ts.isNamedImports(nb)) {
      for (const el of nb.elements) {
        if (!el.isTypeOnly) imports.set(el.name.text, from);
      }
    }
  }
  return imports;
}

function calleeParts(call) {
  const ts = ctx.ts;
  let e = call.expression;
  const names = [];
  while (ts.isPropertyAccessExpression(e)) {
    names.unshift(e.name.text);
    e = e.expression;
  }
  if (ts.isIdentifier(e)) return { root: e.text, name: names.length ? names[names.length - 1] : e.text, chain: [e.text, ...names] };
  if (e.kind === ts.SyntaxKind.ThisKeyword) return { root: "this", name: names[names.length - 1], chain: ["this", ...names] };
  return null;
}

function unwrapCall(expr) {
  const ts = ctx.ts;
  let e = expr;
  while (ts.isAwaitExpression(e) || ts.isVoidExpression(e) || ts.isParenthesizedExpression(e)) e = e.expression;
  return ts.isCallExpression(e) ? e : null;
}

function isStatementListParent(node) {
  const ts = ctx.ts;
  const p = node.parent;
  return p && (ts.isBlock(p) || ts.isSourceFile(p) || ts.isCaseClause(p) || ts.isDefaultClause(p) || ts.isModuleBlock(p));
}

function enclosingEffect(node) {
  const ts = ctx.ts;
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const parts = calleeParts(p);
      if (parts && /^use(Layout)?Effect$|^useMount$|^useUnmount$|^useUpdateEffect$/.test(parts.name)) return parts.name;
    }
  }
  return null;
}

const REFETCH_RE = /^(refetch\w*|invalidate\w*|reload\w*|refresh\w*|reset\w*(Cache|Query|QueryState|ApiState)\w*|clear\w*Cache\w*|fetch[A-Z]\w*)$/;
const NOT_WIRING_ROOTS = new Set(["_", "console", "Object", "Array", "Math", "JSON", "Promise", "Number", "String", "t", "jt", "ngettext", "msgid", "invariant", "expect", "assert", "assertNever", "checkNotNull", "Lib", "Urls"]);
const WIRING_NAME_RE = /^(register\w*|subscribe|unsubscribe|addEventListener|removeEventListener|track\w*|dispatch|emit|publish|open\w*|close\w*|navigate|onChange|onUpdate\w*|onSave|onSubmit)$/;
const ROUTER_ROOTS = new Set(["history", "router", "browserHistory", "navigate"]);

function refetchName(call) {
  const parts = calleeParts(call);
  if (!parts) return null;
  if (parts.name === "invalidateSize") return null;
  if (REFETCH_RE.test(parts.name)) return parts.name;
  if (parts.name === "dispatch" && call.arguments.length === 1) {
    const inner = unwrapCall(call.arguments[0]);
    const ip = inner && calleeParts(inner);
    if (ip && REFETCH_RE.test(ip.name)) return `dispatch(${ip.chain.join(".")})`;
  }
  return null;
}

function removeStatementEdit(sf, stmt) {
  return { start: stmt.getFullStart(), end: stmt.getEnd(), replacement: "" };
}

export function removeCall(file) {
  const ts = ctx.ts;
  const { sf } = parse(file);
  const imports = valueImports(sf);
  const out = [];
  walk(sf, (node) => {
    if (!ts.isExpressionStatement(node) || !isStatementListParent(node)) return;
    const call = unwrapCall(node.expression);
    if (!call) return;
    const parts = calleeParts(call);
    if (!parts || NOT_WIRING_ROOTS.has(parts.root)) return;
    if (/^use[A-Z]/.test(parts.name)) return;
    if (/^(push|replace)$/.test(parts.name) && !ROUTER_ROOTS.has(parts.root)) return;
    if (refetchName(call)) return;
    const effect = enclosingEffect(node);
    const imported = imports.has(parts.root);
    const wiringName = WIRING_NAME_RE.test(parts.name) || parts.root === "dispatch";
    if (!imported && !wiringName && !effect) return;
    const why = imported ? `imported from ${imports.get(parts.root)}` : effect ? `inside ${effect}` : "side-effecting call";
    out.push({
      operator: "remove-call",
      stratum: "wiring",
      file,
      line: lineOf(sf, node.getStart()),
      end_line: lineOf(sf, node.getEnd()),
      description: `Remove call \`${snippet(node.getText())}\` (${why})`,
      priority: (wiringName ? (parts.name.startsWith("track") ? 1 : 3) : 0) + (effect ? 2 : 0) + (imported ? 1 : 0),
      edit: removeStatementEdit(sf, node),
    });
  });
  return out;
}

export function dropRefetch(file) {
  const ts = ctx.ts;
  const { sf } = parse(file);
  const out = [];
  walk(sf, (node) => {
    if (!ts.isExpressionStatement(node) || !isStatementListParent(node)) return;
    const call = unwrapCall(node.expression);
    const name = call && refetchName(call);
    if (!name) return;
    out.push({
      operator: "drop-refetch",
      stratum: "state",
      file,
      line: lineOf(sf, node.getStart()),
      end_line: lineOf(sf, node.getEnd()),
      description: `Remove refetch/invalidation \`${snippet(node.getText())}\``,
      priority: /refetch|invalidate/i.test(name) ? 3 : /reload|refresh/i.test(name) ? 2 : 1,
      edit: removeStatementEdit(sf, node),
    });
  });
  return out;
}

const PRESENTATIONAL = new Set([
  "key", "ref", "className", "style", "children", "id", "css", "sx", "classNames", "styles",
  "c", "color", "bg", "bd", "size", "variant", "radius", "shadow", "fw", "fz", "lh", "ta", "tt", "td", "ff", "lts",
  "w", "h", "miw", "maw", "mih", "mah", "m", "mt", "mb", "ml", "mr", "mx", "my", "p", "pt", "pb", "pl", "pr", "px", "py",
  "gap", "rowGap", "columnGap", "align", "justify", "direction", "wrap", "flex", "display", "pos", "top", "left", "right", "bottom",
  "span", "order", "grow", "shrink", "icon", "leftSection", "rightSection", "leftIcon", "rightIcon", "title", "label", "placeholder",
  "description", "tooltip", "alt", "name", "width", "height", "fullWidth", "compact", "withinPortal", "position", "offset",
  "zIndex", "transitionProps", "lineClamp", "truncate", "inline", "role", "tabIndex", "type", "autoFocus", "data-testid",
]);
const VALUE_PROPS = /^(value|values|checked|selected\w*|isOpen|opened|open|question|card|dashboard|dashcard|query|parameters?|parameterValues?|data|rows|cols|series|settings|rawSeries|metadata|filters?|items|options|disabled|isEditing|isDisabled|mode|state|initialValues|collectionId|databaseId|tableId|cardId|dashboardId|entity\w*|model|source\w*|target\w*)$/;

export function dropProp(file) {
  const ts = ctx.ts;
  if (!/\.(tsx|jsx|js)$/.test(file)) return [];
  const { sf } = parse(file);
  const out = [];
  walk(sf, (node) => {
    if (!ts.isJsxAttribute(node)) return;
    const el = node.parent?.parent;
    if (!el || !(ts.isJsxOpeningElement(el) || ts.isJsxSelfClosingElement(el))) return;
    const tag = el.tagName.getText();
    if (!/^[A-Z]/.test(tag) && !tag.includes(".")) return;
    const name = node.name.getText();
    if (PRESENTATIONAL.has(name) || name.startsWith("aria-") || name.startsWith("data-")) return;
    const init = node.initializer;
    if (!init || !ts.isJsxExpression(init) || !init.expression) return;
    if (ts.isStringLiteral(init.expression) || ts.isNumericLiteral(init.expression)) return;
    const isHandler = /^on[A-Z]/.test(name);
    const isValue = VALUE_PROPS.test(name);
    out.push({
      operator: "drop-prop",
      stratum: "wiring",
      file,
      line: lineOf(sf, node.getStart()),
      end_line: lineOf(sf, node.getEnd()),
      description: `Drop prop \`${name}\` from <${tag}> (\`${snippet(node.getText(), 50)}\`)`,
      priority: isHandler ? 3 : isValue ? 2 : 1,
      edit: { start: node.getFullStart(), end: node.getEnd(), replacement: "" },
    });
  });
  return out.filter((c) => c.priority >= 2);
}

const ARRAY_METHODS = new Set(["map", "filter", "find", "findIndex", "length", "some", "every", "forEach", "reduce", "includes", "slice", "concat", "indexOf", "then", "catch", "unwrap", "toString", "flatMap", "sort", "keys", "values", "entries", "at", "join", "has", "get"]);
const QUERY_HOOK_RE = /^use(Lazy)?\w+(Query|QueryState|InfiniteQuery)$/;
const MUTATION_HOOK_RE = /^use\w+Mutation$/;

function hookBindings(sf) {
  const ts = ctx.ts;
  const responseNames = [];
  const mutationTriggers = [];
  walk(sf, (node) => {
    if (!ts.isVariableDeclaration(node) || !node.initializer) return;
    let init = node.initializer;
    while (ts.isAwaitExpression(init) || ts.isParenthesizedExpression(init) || ts.isAsExpression(init)) init = init.expression;
    const scope = node.parent?.parent?.parent;
    if (ts.isCallExpression(init)) {
      const parts = calleeParts(init);
      if (parts && (QUERY_HOOK_RE.test(parts.name) || /^(initiate|unwrap)$/.test(parts.name) || /\.endpoints\./.test(init.expression.getText()))) {
        let pattern = node.name;
        if (ts.isArrayBindingPattern(pattern) && pattern.elements[1] && ts.isBindingElement(pattern.elements[1])) pattern = pattern.elements[1].name;
        if (ts.isObjectBindingPattern(pattern)) {
          for (const el of pattern.elements) {
            const prop = el.propertyName ? el.propertyName.getText() : el.name.getText();
            if (prop === "data" || prop === "currentData") {
              if (ts.isIdentifier(el.name)) responseNames.push({ name: el.name.text, scope, via: parts.name });
              else if (ts.isObjectBindingPattern(el.name)) {
                for (const inner of el.name.elements) {
                  const key = inner.propertyName ? inner.propertyName.getText() : inner.name.getText();
                  responseNames.push({ destructured: inner, key, via: parts.name });
                }
              }
            }
          }
        }
      }
      if (parts && MUTATION_HOOK_RE.test(parts.name) && ts.isArrayBindingPattern(node.name)) {
        const first = node.name.elements[0];
        if (first && ts.isBindingElement(first) && ts.isIdentifier(first.name)) mutationTriggers.push({ name: first.name.text, hook: parts.name });
      }
    }
    if (ts.isIdentifier(node.name) && /^(response|res|result|resp|payload)$/.test(node.name.text) && ts.isAwaitExpression(node.initializer)) {
      responseNames.push({ name: node.name.text, scope, via: "await" });
    }
  });
  return { responseNames, mutationTriggers };
}

function renameKeyEdit(prop) {
  const ts = ctx.ts;
  if (ts.isShorthandPropertyAssignment(prop)) {
    const n = prop.name.text;
    return { start: prop.name.getStart(), end: prop.name.getEnd(), replacement: `${n}${n.slice(-1)}: ${n}`, from: n, to: n + n.slice(-1) };
  }
  if (ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) {
    const n = prop.name.text;
    const to = n + n.slice(-1);
    const replacement = ts.isStringLiteral(prop.name) ? JSON.stringify(to) : to;
    return { start: prop.name.getStart(), end: prop.name.getEnd(), replacement, from: n, to };
  }
  return null;
}

function objectArgProps(call) {
  const ts = ctx.ts;
  const obj = call.arguments.find((a) => ts.isObjectLiteralExpression(a));
  if (!obj) return [];
  return obj.properties.filter((p) => ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p));
}

function endpointQueryObjects(sf, endpointNames) {
  const ts = ctx.ts;
  const out = [];
  walk(sf, (node) => {
    if (!ts.isPropertyAssignment(node) || !ts.isCallExpression(node.initializer)) return;
    const parts = calleeParts(node.initializer);
    if (!parts || parts.root !== "builder" || !/^(query|mutation|infiniteQuery)$/.test(parts.name)) return;
    const endpoint = node.name.getText();
    if (endpointNames && !endpointNames.has(endpoint)) return;
    out.push({ endpoint, kind: parts.name, node });
  });
  return out;
}

export function renameKey(file, { endpointNames } = {}) {
  const ts = ctx.ts;
  const { sf } = parse(file);
  const out = [];
  const { responseNames } = hookBindings(sf);
  const push = (node, edit, description, priority) =>
    out.push({
      operator: "rename-key",
      stratum: "wiring",
      file,
      line: lineOf(sf, node.getStart()),
      end_line: lineOf(sf, node.getEnd()),
      description,
      priority,
      edit: { start: edit.start, end: edit.end, replacement: edit.replacement },
    });

  const tracked = responseNames.filter((r) => r.name);
  walk(sf, (node) => {
    if (!ts.isPropertyAccessExpression(node) || !ts.isIdentifier(node.expression)) return;
    const hit = tracked.find((r) => r.name === node.expression.text && (!r.scope || (node.pos >= r.scope.pos && node.end <= r.scope.end)));
    if (!hit) return;
    const key = node.name.text;
    if (ARRAY_METHODS.has(key)) return;
    if (ts.isCallExpression(node.parent) && node.parent.expression === node) return;
    const to = key + key.slice(-1);
    push(node.name, { start: node.name.getStart(), end: node.name.getEnd(), replacement: to },
      `Read \`${node.expression.text}.${to}\` instead of \`.${key}\` from the ${hit.via} response`, 3);
  });
  for (const r of responseNames.filter((r) => r.destructured)) {
    const el = r.destructured;
    if (ARRAY_METHODS.has(r.key)) continue;
    const to = r.key + r.key.slice(-1);
    const edit = el.propertyName
      ? { start: el.propertyName.getStart(), end: el.propertyName.getEnd(), replacement: to }
      : { start: el.name.getStart(), end: el.name.getEnd(), replacement: `${to}: ${r.key}` };
    push(el, edit, `Destructure \`${to}\` instead of \`${r.key}\` from the ${r.via} response`, 3);
  }

  walk(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const parts = calleeParts(node);
    if (!parts || !QUERY_HOOK_RE.test(parts.name)) return;
    for (const prop of objectArgProps(node)) {
      const edit = renameKeyEdit(prop);
      if (!edit || /^(skip|refetchOnMountOrArgChange|pollingInterval|selectFromResult)$/.test(edit.from)) continue;
      push(prop, edit, `Send query param \`${edit.to}\` instead of \`${edit.from}\` to ${parts.name}`, 2);
    }
  });

  if (API_DIRS.some((d) => file.startsWith(d))) {
    for (const ep of endpointQueryObjects(sf, endpointNames)) {
      walk(ep.node, (node) => {
        if (!ts.isPropertyAssignment(node) || node.name.getText() !== "params" || !ts.isObjectLiteralExpression(node.initializer)) return;
        for (const prop of node.initializer.properties) {
          const edit = renameKeyEdit(prop);
          if (!edit) continue;
          push(prop, edit, `Endpoint ${ep.endpoint} sends param \`${edit.to}\` instead of \`${edit.from}\``, 2);
        }
      });
      walk(ep.node, (node) => {
        if (!ts.isPropertyAssignment(node) || node.name.getText() !== "transformResponse") return;
        walk(node.initializer, (inner) => {
          if (ts.isPropertyAccessExpression(inner) && ts.isIdentifier(inner.expression) && !ARRAY_METHODS.has(inner.name.text)) {
            const key = inner.name.text;
            push(inner.name, { start: inner.name.getStart(), end: inner.name.getEnd(), replacement: key + key.slice(-1) },
              `Endpoint ${ep.endpoint} reads \`${key}${key.slice(-1)}\` from the response`, 3);
          }
        });
      });
    }
  }
  return out;
}

const PERSIST_CALL_RE = /^(update|save|create|persist|put|post|edit|upsert)[A-Z]\w*$|^(update|save|create|put|post)$/;
const NOT_PERSIST_RE = /^create(Slice|Selector|Action|ThunkAction|AsyncThunk|Element|Portal|Context|Ref|Mock|Raw|Plain|Store|Reducer|Series|Formatter|Entity|Api|Theme|Style)|Url$|^createGuard$|^update(Url|State|Local\w*)$|^save\w*(Image|Pdf|File)$/;

export function dropPersistedField(file, { endpointNames } = {}) {
  const ts = ctx.ts;
  const { sf } = parse(file);
  const out = [];
  const { mutationTriggers } = hookBindings(sf);
  const triggerNames = new Set(mutationTriggers.map((m) => m.name));
  const dropEdit = (obj, i) => {
    const props = obj.properties;
    const p = props[i];
    if (i < props.length - 1) return { start: p.getFullStart(), end: props[i + 1].getFullStart(), replacement: "" };
    if (i > 0) return { start: props[i - 1].getEnd(), end: p.getEnd(), replacement: "" };
    return { start: p.getFullStart(), end: p.getEnd(), replacement: "" };
  };
  const considerObject = (obj, context, priority) => {
    obj.properties.forEach((p, i) => {
      if (!(ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p))) return;
      const key = p.name.getText();
      if (/^(id|method|url|key|toast|showToast|options|opts|dispatch|question|card|dashboard)$|^on[A-Z]|^original/.test(key)) return;
      out.push({
        operator: "drop-persisted-field",
        stratum: "state",
        file,
        line: lineOf(sf, p.getStart()),
        end_line: lineOf(sf, p.getEnd()),
        description: `Drop \`${key}\` from the object sent by ${context}`,
        priority,
        edit: dropEdit(obj, i),
      });
    });
  };
  walk(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const parts = calleeParts(node);
    if (!parts) return;
    const isTrigger = triggerNames.has(parts.root) && parts.chain.length === 1;
    if (!isTrigger && (!PERSIST_CALL_RE.test(parts.name) || NOT_PERSIST_RE.test(parts.name))) return;
    if (/^(delete|remove|archive)/i.test(parts.name)) return;
    if (!isTrigger && (parts.chain.length > 2 || /^(Question|Lib|Object|_)$/.test(parts.root))) return;
    const obj = node.arguments.find((a) => ts.isObjectLiteralExpression(a));
    if (!obj) return;
    const named = obj.properties.filter((p) => ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p));
    if (named.length < 2 && !obj.properties.some(ts.isSpreadAssignment)) return;
    considerObject(obj, `\`${parts.chain.join(".")}(…)\``, isTrigger ? 3 : 2);
  });
  if (API_DIRS.some((d) => file.startsWith(d))) {
    for (const ep of endpointQueryObjects(sf, endpointNames)) {
      if (ep.kind !== "mutation") continue;
      walk(ep.node, (node) => {
        if (ts.isPropertyAssignment(node) && node.name.getText() === "body" && ts.isObjectLiteralExpression(node.initializer)) {
          considerObject(node.initializer, `endpoint ${ep.endpoint}`, 3);
        }
      });
    }
  }
  return out;
}

export function dropCacheTag(file, { endpointNames } = {}) {
  const ts = ctx.ts;
  const { sf } = parse(file);
  const out = [];
  for (const ep of endpointQueryObjects(sf, endpointNames)) {
    walk(ep.node, (node) => {
      if (!ts.isPropertyAssignment(node) || !/^(providesTags|invalidatesTags)$/.test(node.name.getText())) return;
      const kind = node.name.getText();
      walk(node.initializer, (arr) => {
        if (!ts.isArrayLiteralExpression(arr)) return;
        const els = arr.elements;
        els.forEach((el, i) => {
          const edit =
            i < els.length - 1
              ? { start: el.getFullStart(), end: els[i + 1].getFullStart(), replacement: "" }
              : i > 0
                ? { start: els[i - 1].getEnd(), end: el.getEnd(), replacement: "" }
                : { start: el.getFullStart(), end: el.getEnd(), replacement: "" };
          if (els.length === 1) {
            const after = sf.text.slice(el.getEnd(), arr.getEnd() - 1);
            edit.end = el.getEnd() + after.length;
          }
          out.push({
            operator: "drop-cache-tag",
            stratum: "state",
            file,
            line: lineOf(sf, el.getStart()),
            end_line: lineOf(sf, el.getEnd()),
            description: `Endpoint ${ep.endpoint}: drop \`${snippet(el.getText(), 50)}\` from ${kind}`,
            priority: kind === "invalidatesTags" ? 3 : 2,
            endpoint: ep.endpoint,
            edit,
          });
        });
      });
    });
  }
  return out;
}

export function endpointsUsedBy(file) {
  const ts = ctx.ts;
  const { sf } = parse(file);
  const imports = valueImports(sf);
  const names = new Set();
  for (const [local, from] of imports) {
    if (!/(^|\/)api(\/|$)|^metabase\/api|^metabase-enterprise\/api/.test(from)) continue;
    const m = local.match(/^use(?:Lazy)?(\w+?)(?:Query|Mutation|QueryState|InfiniteQuery)$/);
    if (m) names.add(m[1][0].toLowerCase() + m[1].slice(1));
  }
  walk(sf, (node) => {
    if (ts.isPropertyAccessExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "endpoints") {
      names.add(node.name.text);
    }
  });
  return names;
}

export function apiEndpointIndex() {
  const index = new Map();
  for (const dir of API_DIRS) {
    const abs = path.join(ctx.root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs, { recursive: true })) {
      if (!/\.tsx?$/.test(f) || /\.(unit\.)?spec\./.test(f) || f.includes("__")) continue;
      const rel = path.join(dir, f);
      const { sf } = parse(rel);
      for (const ep of endpointQueryObjects(sf)) index.set(ep.endpoint, rel);
    }
  }
  return index;
}

export const OPERATORS = {
  "remove-call": removeCall,
  "drop-prop": dropProp,
  "rename-key": renameKey,
  "drop-cache-tag": dropCacheTag,
  "drop-refetch": dropRefetch,
  "drop-persisted-field": dropPersistedField,
};

