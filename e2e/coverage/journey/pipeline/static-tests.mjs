// Usage: node static-tests.mjs <source dir> <tests.json> <out file>
// Parses every e2e spec in <source dir> with the TypeScript compiler API.
// <source dir> holds `e2e/` at the capture's SHA, from `git archive`.
// For each `it` it records an ordered event list (visits, actions, waits, helper calls, assertions),
// with hooks prepended and every helper call expanded into the assertions it makes.
// Captured tests (<tests.json>) are matched to static tests by full title.
// Writes <out file>.
import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

const [E2E, TESTS_FILE, OUT_FILE] = process.argv.slice(2);
if (!E2E || !TESTS_FILE || !OUT_FILE) {
  console.error(
    "Usage: node static-tests.mjs <source dir> <tests.json> <out file>",
  );
  process.exit(1);
}

const MAX_DEPTH = 8;
const MAX_TEXT = 4000;

const ACTIONS = new Set([
  "click",
  "dblclick",
  "rightclick",
  "type",
  "clear",
  "check",
  "uncheck",
  "select",
  "trigger",
  "focus",
  "blur",
  "submit",
  "scrollIntoView",
  "scrollTo",
  "selectFile",
  "realClick",
  "realHover",
  "realPress",
  "realType",
  "realMouseDown",
  "realMouseUp",
  "realMouseMove",
  "realSwipe",
  "realTouch",
  "paste",
  "button",
  "icon",
]);
const NAV = new Set(["visit", "reload", "go"]);
const CALLBACK_LINKS = new Set(["then", "within", "each", "spread"]);
const QUERY_ROOTS =
  /^(get|find|findBy|findAllBy|contains|icon|button|eq|first|last|parent|parents|children|closest|filter|siblings|next|prev|its|invoke|focused|root|document|window|url|location|title|hash)/;

// ---------- files, imports, function index ----------

const fileCache = new Map();
function kindFor(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".ts")) return ts.ScriptKind.TS;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

function loadFile(file) {
  if (fileCache.has(file)) return fileCache.get(file);
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    kindFor(file),
  );
  const info = {
    file,
    sf,
    imports: new Map(),
    functions: new Map(),
    reexports: [],
  };
  fileCache.set(file, info);
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && st.importClause) {
      const from = st.moduleSpecifier.text;
      const clause = st.importClause;
      if (clause.name)
        info.imports.set(clause.name.text, { from, name: "default" });
      const nb = clause.namedBindings;
      if (nb && ts.isNamedImports(nb)) {
        for (const el of nb.elements) {
          info.imports.set(el.name.text, {
            from,
            name: (el.propertyName ?? el.name).text,
          });
        }
      } else if (nb && ts.isNamespaceImport(nb)) {
        info.imports.set(nb.name.text, { from, name: "*" });
      }
    }
    if (ts.isExportDeclaration(st) && st.moduleSpecifier) {
      info.reexports.push({
        from: st.moduleSpecifier.text,
        names:
          st.exportClause && ts.isNamedExports(st.exportClause)
            ? st.exportClause.elements.map((e) => [
                (e.propertyName ?? e.name).text,
                e.name.text,
              ])
            : null,
      });
    }
    const exported = !!st.modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (ts.isFunctionDeclaration(st) && st.name && st.body) {
      info.functions.set(st.name.text, {
        name: st.name.text,
        file,
        node: st,
        exported,
      });
    }
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        const init = strip(d.initializer);
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          info.functions.set(d.name.text, {
            name: d.name.text,
            file,
            node: init,
            exported,
          });
        } else if (ts.isObjectLiteralExpression(init)) {
          for (const p of init.properties) {
            const key =
              p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
                ? p.name.text
                : null;
            if (!key) continue;
            let fn = null;
            if (ts.isMethodDeclaration(p) && p.body) fn = p;
            if (ts.isPropertyAssignment(p)) {
              const v = strip(p.initializer);
              if (ts.isArrowFunction(v) || ts.isFunctionExpression(v)) fn = v;
            }
            if (fn) {
              const name = `${d.name.text}.${key}`;
              info.functions.set(name, { name, file, node: fn, exported });
            }
          }
        }
      }
    }
  }
  return info;
}

function resolveModule(fromFile, spec) {
  let base;
  if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else if (spec.startsWith("e2e/")) base = path.join(E2E, spec);
  else return null;
  for (const cand of [
    base,
    ...[".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js"].map(
      (e) => base + e,
    ),
  ]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

// Finds an exported function by name in a module, following `export * from` and `export { x } from`.
function lookupExport(file, name, depth = 0) {
  if (!file || depth > 4) return null;
  const info = loadFile(file);
  const own = info.functions.get(name);
  if (own) return own;
  for (const re of info.reexports) {
    const target = resolveModule(file, re.from);
    if (!target) continue;
    if (re.names === null) {
      const hit = lookupExport(target, name, depth + 1);
      if (hit) return hit;
    } else {
      const pair = re.names.find(([, exportedAs]) => exportedAs === name);
      if (pair) return lookupExport(target, pair[0], depth + 1);
    }
  }
  return null;
}

function walkDir(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "assets")
        walkDir(full, out);
    } else if (
      /\.(ts|tsx|js|jsx)$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

const HELPERS_INDEX = path.join(E2E, "e2e/support/helpers/index.ts");
function helperByName(name) {
  return lookupExport(HELPERS_INDEX, name);
}

// Custom commands: Cypress.Commands.add("name", [options,] fn).
const commands = new Map();
for (const file of walkDir(path.join(E2E, "e2e/support"))) {
  const info = loadFile(file);
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(info.sf) === "Cypress.Commands.add" &&
      node.arguments.length >= 2 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      const fn = strip(node.arguments[node.arguments.length - 1]);
      if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
        const name = node.arguments[0].text;
        commands.set(name, {
          name: `cy.${name}`,
          file,
          node: fn,
          exported: true,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(info.sf);
}

// ---------- normalization ----------

function strip(e) {
  while (
    e &&
    (ts.isParenthesizedExpression(e) ||
      ts.isAwaitExpression(e) ||
      ts.isNonNullExpression(e) ||
      ts.isAsExpression(e) ||
      ts.isTypeAssertionExpression?.(e) ||
      ts.isSatisfiesExpression?.(e))
  ) {
    e = e.expression;
  }
  return e;
}

function clip(s) {
  s = s.replace(/\s+/g, " ");
  return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) + "…" : s;
}

function shortHash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++)
    h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36).slice(0, 6);
}

// `env` is a walk context: its params become «name» placeholders and its local consts are inlined,
// so two tests passing differently-valued locals to the same helper stay distinguishable.
function norm(node, env, seen = new Set()) {
  if (!node) return "";
  node = strip(node);
  const params = env?.params;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return JSON.stringify(node.text);
  if (ts.isNumericLiteral(node)) return node.text;
  if (ts.isIdentifier(node)) {
    if (params?.has(node.text)) return `«${node.text}»`;
    const init = lookupConst(node.text, env);
    if (init && !seen.has(node.text))
      return norm(init, env, new Set(seen).add(node.text));
    return node.text;
  }
  if (ts.isPropertyAccessExpression(node))
    return `${norm(node.expression, env, seen)}.${node.name.text}`;
  if (ts.isElementAccessExpression(node))
    return `${norm(node.expression, env, seen)}[${norm(node.argumentExpression, env, seen)}]`;
  if (ts.isTemplateExpression(node)) {
    let s = "`" + node.head.text;
    for (const span of node.templateSpans)
      s += "${" + norm(span.expression, env, seen) + "}" + span.literal.text;
    return s + "`";
  }
  if (ts.isObjectLiteralExpression(node)) {
    return clip(
      "{" +
        node.properties
          .map((p) => {
            if (ts.isShorthandPropertyAssignment(p))
              return `${p.name.text}:${norm(p.name, env, seen)}`;
            if (ts.isPropertyAssignment(p))
              return `${p.name.getText()}:${norm(p.initializer, env, seen)}`;
            if (ts.isSpreadAssignment(p))
              return `...${norm(p.expression, env, seen)}`;
            return p.name ? `${p.name.getText()}()` : "?";
          })
          .join(",") +
        "}",
    );
  }
  if (ts.isArrayLiteralExpression(node))
    return clip(
      "[" + node.elements.map((e) => norm(e, env, seen)).join(",") + "]",
    );
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    // Parameters a callback closes over stay as placeholders, so the caller's values still reach the text.
    const used = new Set();
    const visit = (n) => {
      if (ts.isIdentifier(n) && params?.has(n.text)) used.add(n.text);
      ts.forEachChild(n, visit);
    };
    visit(node);
    const closed = used.size
      ? `[${[...used].map((p) => `«${p}»`).join(",")}]`
      : "";
    return `fn#${shortHash(node.getText())}${closed}`;
  }
  if (ts.isCallExpression(node)) {
    return clip(
      `${norm(node.expression, env, seen)}(${node.arguments.map((a) => norm(a, env, seen)).join(",")})`,
    );
  }
  if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand))
    return node.getText();
  if (
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword ||
    node.kind === ts.SyntaxKind.ThisKeyword
  )
    return node.getText();
  if (ts.isRegularExpressionLiteral(node)) return node.text;
  let text = node.getText();
  if (params?.size) {
    for (const p of params.keys())
      text = text.replace(new RegExp(`\\b${p}\\b`, "g"), `«${p}»`);
  }
  return clip(text);
}

function lookupConst(name, env) {
  const consts = env?.consts;
  if (!consts) return null;
  for (let i = consts.length - 1; i >= 0; i--) {
    const hit = consts[i].get(name);
    if (hit) return hit;
  }
  return null;
}

function args(call, env) {
  return call.arguments.map((a) => norm(a, env)).join(", ");
}

// ---------- event extraction ----------

const templateCache = new Map();

function paramMap(fnNode) {
  const params = new Map();
  fnNode.parameters?.forEach((p, i) => {
    if (ts.isIdentifier(p.name))
      params.set(p.name.text, { index: i, prop: null });
    else if (ts.isObjectBindingPattern(p.name)) {
      for (const el of p.name.elements) {
        if (ts.isIdentifier(el.name)) {
          params.set(el.name.text, {
            index: i,
            prop: (el.propertyName ?? el.name).getText(),
          });
        }
      }
    }
  });
  return params;
}

function substitute(text, bindings) {
  return text.replace(/«([\w$]+)»/g, (m, name) =>
    bindings.has(name) ? bindings.get(name) : m,
  );
}

function callBindings(def, call, callerCtx) {
  const params = paramMap(def.node);
  const bindings = new Map();
  for (const [name, { index, prop }] of params) {
    const arg = call?.arguments?.[index];
    if (!arg) continue;
    let a = strip(arg);
    if (prop === null) bindings.set(name, norm(a, callerCtx));
    else {
      if (ts.isIdentifier(a)) a = lookupConst(a.text, callerCtx) ?? a;
      if (!ts.isObjectLiteralExpression(a)) {
        bindings.set(name, `${norm(a, callerCtx)}.${prop}`);
        continue;
      }
      const hit = a.properties.find((p) => p.name?.getText() === prop);
      if (hit && ts.isPropertyAssignment(hit))
        bindings.set(name, norm(hit.initializer, callerCtx));
      if (hit && ts.isShorthandPropertyAssignment(hit))
        bindings.set(name, norm(hit.name, callerCtx));
    }
  }
  return bindings;
}

const UNKNOWN = Symbol("unknown");

function literalValue(node, callerCtx) {
  node = strip(node);
  if (
    callerCtx?.values &&
    ts.isIdentifier(node) &&
    callerCtx.values.has(node.text)
  ) {
    return callerCtx.values.get(node.text);
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isIdentifier(node) && node.text === "undefined") return undefined;
  if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node))
    return {};
  return UNKNOWN;
}

// Literal values of a helper's parameters at one call site, so `if (param)` branches can be pruned.
function callValues(def, call, callerCtx) {
  const values = new Map();
  def.node.parameters?.forEach((p, i) => {
    let arg = call?.arguments?.[i] ? strip(call.arguments[i]) : null;
    if (arg && ts.isIdentifier(arg) && ts.isObjectBindingPattern(p.name))
      arg = lookupConst(arg.text, callerCtx) ?? arg;
    const hasSpread =
      arg &&
      ts.isObjectLiteralExpression(arg) &&
      arg.properties.some(ts.isSpreadAssignment);
    if (ts.isIdentifier(p.name)) {
      if (arg) values.set(p.name.text, literalValue(arg, callerCtx));
      else if (p.initializer)
        values.set(p.name.text, literalValue(p.initializer));
      else if (!p.dotDotDotToken && call) values.set(p.name.text, undefined);
    } else if (ts.isObjectBindingPattern(p.name)) {
      for (const el of p.name.elements) {
        if (!ts.isIdentifier(el.name)) continue;
        const prop = (el.propertyName ?? el.name).getText();
        let v = UNKNOWN;
        if (!call) v = UNKNOWN;
        else if (!arg)
          v = el.initializer ? literalValue(el.initializer) : undefined;
        else if (literalValue(arg, callerCtx) === undefined)
          v = el.initializer ? literalValue(el.initializer) : undefined;
        else if (ts.isObjectLiteralExpression(arg)) {
          const hit = arg.properties.find((q) => q.name?.getText() === prop);
          if (hit && ts.isPropertyAssignment(hit))
            v = literalValue(hit.initializer, callerCtx);
          else if (!hit && !hasSpread)
            v = el.initializer ? literalValue(el.initializer) : undefined;
        }
        values.set(el.name.text, v);
      }
    }
  });
  return values;
}

function evalCond(expr, ctx) {
  expr = strip(expr);
  const values = ctx.values;
  if (!values) return UNKNOWN;
  if (ts.isIdentifier(expr))
    return values.has(expr.text) ? values.get(expr.text) : UNKNOWN;
  if (
    ts.isPrefixUnaryExpression(expr) &&
    expr.operator === ts.SyntaxKind.ExclamationToken
  ) {
    const v = evalCond(expr.operand, ctx);
    return v === UNKNOWN ? UNKNOWN : !v;
  }
  if (ts.isTypeOfExpression(expr)) {
    const v = evalCond(expr.expression, ctx);
    return v === UNKNOWN ? UNKNOWN : typeof v;
  }
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    const K = ts.SyntaxKind;
    if (op === K.AmpersandAmpersandToken || op === K.BarBarToken) {
      const l = evalCond(expr.left, ctx);
      const r = evalCond(expr.right, ctx);
      if (op === K.AmpersandAmpersandToken) {
        if (l !== UNKNOWN && !l) return false;
        if (r !== UNKNOWN && !r) return false;
        return l === UNKNOWN || r === UNKNOWN ? UNKNOWN : !!r;
      }
      if (l !== UNKNOWN && l) return true;
      if (r !== UNKNOWN && r) return true;
      return l === UNKNOWN || r === UNKNOWN ? UNKNOWN : false;
    }
    if (
      [
        K.EqualsEqualsEqualsToken,
        K.ExclamationEqualsEqualsToken,
        K.EqualsEqualsToken,
        K.ExclamationEqualsToken,
      ].includes(op)
    ) {
      const l = evalCond(expr.left, ctx);
      const r =
        literalValue(expr.right) !== UNKNOWN
          ? literalValue(expr.right)
          : evalCond(expr.right, ctx);
      if (l === UNKNOWN || r === UNKNOWN) return UNKNOWN;
      const eq =
        op === K.EqualsEqualsToken || op === K.ExclamationEqualsToken
          ? l == r
          : l === r;
      return op === K.EqualsEqualsEqualsToken || op === K.EqualsEqualsToken
        ? eq
        : !eq;
    }
  }
  const lit = literalValue(expr);
  return lit;
}

function expand(def, call, ctx, label) {
  const key = `${def.file}::${def.name}::${def.node.pos}`;
  if (ctx.stack.includes(key) || ctx.stack.length >= MAX_DEPTH) return;
  const values = callValues(def, call, ctx);
  const known = [...values]
    .filter(([, v]) => v !== UNKNOWN)
    .map(([k, v]) => [k, v === undefined ? "__undefined" : v]);
  const memoKey = `${key}|${JSON.stringify(known)}`;
  let template = templateCache.get(memoKey);
  if (!template) {
    template = [];
    templateCache.set(memoKey, template);
    const inner = {
      file: def.file,
      params: paramMap(def.node),
      values,
      stack: [...ctx.stack, key],
      out: template,
      scopes: def.scopes ?? [],
    };
    walkFunction(def.node, inner);
  }
  const bindings = callBindings(def, call, ctx);
  for (const ev of template) {
    ctx.out.push({
      ...ev,
      text: substitute(ev.text, bindings),
      via: [label, ...ev.via],
    });
  }
}

function emit(ctx, kind, text, node) {
  const sf = node.getSourceFile();
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  ctx.out.push({
    kind,
    text: clip(text),
    via: [],
    src: `${path.relative(path.join(E2E, "e2e"), sf.fileName)}:${line}`,
  });
}

function walkFunction(fnNode, ctx) {
  const body = fnNode.body;
  if (!body) return;
  if (ts.isBlock(body)) {
    const scopes = collectLocalFns(body.statements, ctx.file, ctx.scopes ?? []);
    const consts = [...(ctx.consts ?? []), collectConsts(body.statements)];
    walkStatements(body.statements, { ...ctx, scopes, consts });
  } else handleExpr(body, ctx);
}

function walkStatements(statements, ctx) {
  for (const st of statements) walkStatement(st, ctx);
}

function walkStatement(st, ctx) {
  if (!st) return;
  if (ts.isBlock(st)) return walkStatements(st.statements, ctx);
  if (ts.isExpressionStatement(st)) return handleExpr(st.expression, ctx);
  if (ts.isVariableStatement(st)) {
    for (const d of st.declarationList.declarations)
      if (d.initializer) handleExpr(d.initializer, ctx);
    return;
  }
  if (ts.isReturnStatement(st)) return handleExpr(st.expression, ctx);
  if (ts.isIfStatement(st)) {
    const cond = evalCond(st.expression, ctx);
    if (cond === UNKNOWN || cond) walkStatement(st.thenStatement, ctx);
    if (cond === UNKNOWN || !cond) walkStatement(st.elseStatement, ctx);
    return;
  }
  if (
    ts.isForOfStatement(st) ||
    ts.isForInStatement(st) ||
    ts.isForStatement(st) ||
    ts.isWhileStatement(st) ||
    ts.isDoStatement(st)
  )
    return walkStatement(st.statement, ctx);
  if (ts.isTryStatement(st)) {
    walkStatement(st.tryBlock, ctx);
    walkStatement(st.finallyBlock, ctx);
    return;
  }
  if (ts.isSwitchStatement(st)) {
    for (const clause of st.caseBlock.clauses)
      walkStatements(clause.statements, ctx);
  }
}

function handleExpr(expr, ctx) {
  if (!expr) return;
  expr = strip(expr);
  if (ts.isCallExpression(expr)) return handleChain(expr, ctx);
  if (ts.isBinaryExpression(expr)) {
    handleExpr(expr.left, ctx);
    handleExpr(expr.right, ctx);
  } else if (ts.isConditionalExpression(expr)) {
    handleExpr(expr.whenTrue, ctx);
    handleExpr(expr.whenFalse, ctx);
  } else if (ts.isArrayLiteralExpression(expr)) {
    expr.elements.forEach((e) => handleExpr(e, ctx));
  }
}

function flatten(call) {
  const links = [];
  let e = call;
  for (;;) {
    e = strip(e);
    if (ts.isCallExpression(e)) {
      const callee = strip(e.expression);
      if (ts.isPropertyAccessExpression(callee)) {
        links.unshift({ name: callee.name.text, call: e });
        e = callee.expression;
      } else if (ts.isIdentifier(callee)) {
        links.unshift({ name: callee.text, call: e, direct: true });
        return { root: null, links };
      } else {
        return { root: "<expr>", links };
      }
    } else if (ts.isPropertyAccessExpression(e)) {
      links.unshift({ name: e.name.text, call: null });
      e = e.expression;
    } else if (ts.isIdentifier(e)) {
      return { root: e.text, links };
    } else if (e.kind === ts.SyntaxKind.ThisKeyword) {
      return { root: "this", links };
    } else {
      return { root: "<expr>", links };
    }
  }
}

// A block's non-function `const` bindings, which norm inlines where the name appears.
function collectConsts(statements) {
  const consts = new Map();
  for (const st of statements) {
    if (
      !ts.isVariableStatement(st) ||
      !(st.declarationList.flags & ts.NodeFlags.Const)
    )
      continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue;
      const init = strip(d.initializer);
      if (!ts.isArrowFunction(init) && !ts.isFunctionExpression(init)) {
        consts.set(d.name.text, init);
      }
    }
  }
  return consts;
}

// Functions declared directly in a block (a describe body, a test, a helper), visible to code in that block.
function collectLocalFns(statements, file, outerScopes) {
  const scope = new Map();
  const scopes = [...outerScopes, scope];
  for (const st of statements) {
    if (ts.isFunctionDeclaration(st) && st.name && st.body) {
      scope.set(st.name.text, { name: st.name.text, file, node: st, scopes });
    }
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        const init = strip(d.initializer);
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          scope.set(d.name.text, {
            name: d.name.text,
            file,
            node: init,
            scopes,
          });
        }
      }
    }
  }
  return scopes;
}

function resolveBare(name, ctx) {
  for (let i = (ctx.scopes?.length ?? 0) - 1; i >= 0; i--) {
    const hit = ctx.scopes[i].get(name);
    if (hit) return hit;
  }
  const info = loadFile(ctx.file);
  const local = info.functions.get(name);
  if (local) return local;
  const imp = info.imports.get(name);
  if (imp && imp.name !== "*") {
    const target = resolveModule(ctx.file, imp.from);
    if (target) return lookupExport(target, imp.name);
  }
  return null;
}

function resolveMember(rootName, memberPath, ctx) {
  const info = loadFile(ctx.file);
  const imp = info.imports.get(rootName);
  if (imp) {
    const target = resolveModule(ctx.file, imp.from);
    if (target) {
      if (imp.name === "*") return lookupExport(target, memberPath);
      return lookupExport(target, `${imp.name}.${memberPath}`);
    }
  }
  return info.functions.get(`${rootName}.${memberPath}`) ?? null;
}

function walkCallbacks(call, ctx) {
  for (const a of call.arguments) {
    const fn = strip(a);
    if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))
      walkFunction(fn, ctx);
    else if (ts.isIdentifier(fn)) {
      const def = resolveBare(fn.text, ctx);
      if (def) {
        emit(ctx, "helper", `${fn.text}(…)`, a);
        expand(def, null, ctx, fn.text);
      }
    }
  }
}

function handleChain(call, ctx) {
  const { root, links } = flatten(call);
  if (links.length === 0) return;
  let start = 0;
  let subject = [];
  let rootIsIntercept = false;

  if (root === null) {
    const first = links[0];
    if (first.name === "expect") {
      const rest = links
        .slice(1)
        .map((l) =>
          l.call ? `.${l.name}(${args(l.call, ctx)})` : `.${l.name}`,
        )
        .join("");
      emit(ctx, "assert", `expect(${args(first.call, ctx)})${rest}`, call);
      return;
    }
    if (
      [
        "describe",
        "context",
        "it",
        "before",
        "beforeEach",
        "after",
        "afterEach",
      ].includes(first.name)
    )
      return;
    const def = resolveBare(first.name, ctx);
    if (def) {
      emit(ctx, "helper", `${first.name}(${args(first.call, ctx)})`, call);
      expand(def, first.call, ctx, first.name);
    } else {
      walkCallbacks(first.call, ctx);
    }
    subject = [`${first.name}(${args(first.call, ctx)})`];
    start = 1;
  } else if (root === "cy") {
    const first = links[0];
    if (!first.call) return;
    const cmd = commands.get(first.name);
    if (cmd) {
      emit(ctx, "helper", `cy.${first.name}(${args(first.call, ctx)})`, call);
      expand(cmd, first.call, ctx, `cy.${first.name}`);
      subject = [`cy.${first.name}(${args(first.call, ctx)})`];
      start = 1;
    } else if (first.name === "H") {
      return;
    }
  } else if (root === "H") {
    let i = 0;
    const names = [];
    while (i < links.length && !links[i].call) names.push(links[i++].name);
    if (i >= links.length) return;
    names.push(links[i].name);
    const name = names.join(".");
    const def = helperByName(name);
    const text = `H.${name}(${args(links[i].call, ctx)})`;
    emit(ctx, "helper", text, call);
    if (def) expand(def, links[i].call, ctx, `H.${name}`);
    else walkCallbacks(links[i].call, ctx);
    subject = [text];
    start = i + 1;
  } else if (
    root === "Cypress" ||
    root === "console" ||
    root === "JSON" ||
    root === "Object" ||
    root === "Math"
  ) {
    return;
  } else {
    // Namespace or object helpers (`DataStudio.foo()`), else plain JS calls whose callbacks may hold cy commands.
    let i = 0;
    const names = [];
    while (i < links.length && !links[i].call) names.push(links[i++].name);
    if (i < links.length) {
      names.push(links[i].name);
      const def = resolveMember(root, names.join("."), ctx);
      if (def) {
        const text = `${root}.${names.join(".")}(${args(links[i].call, ctx)})`;
        emit(ctx, "helper", text, call);
        expand(def, links[i].call, ctx, `${root}.${names.join(".")}`);
        subject = [text];
        start = i + 1;
      } else {
        for (const l of links) if (l.call) walkCallbacks(l.call, ctx);
        return;
      }
    } else {
      return;
    }
  }

  let lastKind = null;
  for (let i = start; i < links.length; i++) {
    const l = links[i];
    if (!l.call) {
      subject.push(l.name);
      continue;
    }
    const a = args(l.call, ctx);
    const subj = subject.join(".");
    if (l.name === "should" || l.name === "and") {
      const cb = strip(l.call.arguments[0] ?? l.call);
      if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
        const inner = { ...ctx, out: [] };
        walkFunction(cb, inner);
        for (const ev of inner.out)
          ctx.out.push({
            ...ev,
            text: ev.kind === "assert" ? `${subj} ⇒ ${ev.text}` : ev.text,
          });
      } else {
        emit(ctx, "assert", `${subj}.should(${a})`, l.call);
      }
      lastKind = "assert";
    } else if (CALLBACK_LINKS.has(l.name)) {
      walkCallbacks(l.call, ctx);
      lastKind = "callback";
    } else if (NAV.has(l.name) && start === 0 && i === 0) {
      emit(ctx, "nav", `${l.name} ${a}`, l.call);
      lastKind = "nav";
    } else if (l.name === "wait" && i === 0) {
      emit(ctx, "wait", `wait ${a}`, l.call);
      subject = [`wait(${a})`];
      lastKind = "wait";
      continue;
    } else if (l.name === "request" && i === 0) {
      emit(ctx, "request", `request ${a}`, l.call);
      lastKind = "request";
    } else if (l.name === "intercept" && i === 0) {
      rootIsIntercept = true;
      emit(ctx, "intercept", `intercept ${a}`, l.call);
      lastKind = "intercept";
    } else if (l.name === "as") {
      if (rootIsIntercept) ctx.out[ctx.out.length - 1].text += ` as ${a}`;
      lastKind = "as";
    } else if (ACTIONS.has(l.name)) {
      emit(ctx, "act", `${subj}.${l.name}(${a})`, l.call);
      lastKind = "act";
    } else if (
      [
        "log",
        "task",
        "exec",
        "fixture",
        "readFile",
        "writeFile",
        "viewport",
        "clock",
        "tick",
        "signInAsAdmin",
        "signInAsNormalUser",
        "signIn",
        "signOut",
        "session",
        "setCookie",
        "clearCookie",
        "clearCookies",
        "clearLocalStorage",
        "stub",
        "spy",
        "wrap",
      ].includes(l.name)
    ) {
      if (
        i === 0 &&
        [
          "signInAsAdmin",
          "signInAsNormalUser",
          "signIn",
          "signOut",
          "viewport",
          "clock",
        ].includes(l.name)
      ) {
        emit(ctx, "setup", `${l.name}(${a})`, l.call);
      }
      walkCallbacks(l.call, ctx);
      subject = [`${l.name}(${a})`];
      lastKind = "other";
    } else {
      subject.push(`${l.name}(${a})`);
      lastKind = "query";
      for (const arg of l.call.arguments) {
        const fn = strip(arg);
        if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))
          walkFunction(fn, ctx);
      }
    }
  }
  // A chain that ends on a query retries until the element exists, which is an assertion in itself.
  if (
    lastKind === "query" &&
    root === "cy" &&
    QUERY_ROOTS.test(links[links.length - 1].name)
  ) {
    emit(ctx, "implicit", `${subject.join(".")} exists`, call);
  } else if (lastKind === "query" && root === "H" && links.length > start) {
    emit(ctx, "implicit", `${subject.join(".")} exists`, call);
  }
}

// ---------- test discovery ----------

function titleOf(node) {
  node = strip(node);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return {
      re: escapeRe(node.text),
      literal: node.text.length,
      text: node.text,
    };
  }
  if (ts.isTemplateExpression(node)) {
    let re = escapeRe(node.head.text);
    let literal = node.head.text.length;
    let text = node.head.text;
    for (const span of node.templateSpans) {
      re += ".+?" + escapeRe(span.literal.text);
      literal += span.literal.text.length;
      text += "${" + span.expression.getText() + "}" + span.literal.text;
    }
    return { re, literal, text };
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const l = titleOf(node.left);
    const r = titleOf(node.right);
    return {
      re: l.re + r.re,
      literal: l.literal + r.literal,
      text: l.text + r.text,
    };
  }
  return { re: ".+?", literal: 0, text: `\${${node.getText()}}` };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hookAndBody(call) {
  const argsList = call.arguments;
  const fn = [...argsList]
    .reverse()
    .map(strip)
    .find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
  return fn ?? null;
}

const staticTests = [];

// Mocha runs a suite's hooks for every test in it, whichever line they sit on, so hooks are collected first.
function collectHooks(statements, file, scopes) {
  const hooks = [];
  for (const st of statements) {
    if (!ts.isExpressionStatement(st)) continue;
    const e = strip(st.expression);
    if (!ts.isCallExpression(e) || !ts.isIdentifier(e.expression)) continue;
    const name = e.expression.text;
    // A hook given a function reference, like `before(H.restore)`, still counts for the describe's `before` depths.
    if (name === "before" || name === "beforeEach") {
      hooks.push({ kind: name, fn: hookAndBody(e), file, scopes });
    }
  }
  return hooks;
}

function discover(
  statements,
  file,
  titles,
  hooks,
  seen,
  outerScopes,
  outerConsts = [],
) {
  const scopes = collectLocalFns(statements, file, outerScopes);
  const consts = [...outerConsts, collectConsts(statements)];
  const ownHooks = collectHooks(statements, file, scopes).map((h) => ({
    ...h,
    consts,
    depth: titles.length,
  }));
  const allHooks = [...hooks, ...ownHooks];
  for (const st of statements)
    discoverStatement(st, file, titles, allHooks, seen, scopes, consts);
}

function discoverStatement(st, file, titles, hooks, seen, scopes, consts) {
  if (ts.isBlock(st))
    return discover(st.statements, file, titles, hooks, seen, scopes, consts);
  if (
    ts.isForOfStatement(st) ||
    ts.isForStatement(st) ||
    ts.isForInStatement(st)
  ) {
    return discoverStatement(
      st.statement,
      file,
      titles,
      hooks,
      seen,
      scopes,
      consts,
    );
  }
  if (ts.isIfStatement(st)) {
    discoverStatement(
      st.thenStatement,
      file,
      titles,
      hooks,
      seen,
      scopes,
      consts,
    );
    if (st.elseStatement)
      discoverStatement(
        st.elseStatement,
        file,
        titles,
        hooks,
        seen,
        scopes,
        consts,
      );
    return;
  }
  if (!ts.isExpressionStatement(st)) return;
  const e = strip(st.expression);
  if (!ts.isCallExpression(e)) return;
  const callee = strip(e.expression);
  let name = null;
  let modifier = null;
  if (ts.isIdentifier(callee)) name = callee.text;
  else if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression)
  ) {
    name = callee.expression.text;
    modifier = callee.name.text;
  }
  if ((name === "describe" || name === "context") && e.arguments.length >= 2) {
    const fn = hookAndBody(e);
    if (!fn || modifier === "skip") return;
    const body = ts.isBlock(fn.body) ? fn.body.statements : [];
    return discover(
      body,
      file,
      [...titles, titleOf(e.arguments[0])],
      hooks,
      seen,
      scopes,
      consts,
    );
  }
  if ((name === "it" || name === "specify") && e.arguments.length >= 2) {
    if (modifier === "skip") return;
    const fn = hookAndBody(e);
    if (!fn) return;
    staticTests.push({
      file,
      titles: [...titles, titleOf(e.arguments[0])],
      hooks,
      fn,
      node: e,
      scopes,
      consts,
    });
    return;
  }
  // Calls that define tests elsewhere: a local or imported function, or an array's forEach over one.
  const fnRefs = [];
  if (ts.isIdentifier(callee)) {
    const def = resolveBare(callee.text, { file, scopes });
    if (def) fnRefs.push(def);
  }
  for (const a of e.arguments) {
    const s = strip(a);
    if (ts.isArrowFunction(s) || ts.isFunctionExpression(s))
      fnRefs.push({ node: s, file, name: "<callback>", scopes });
    else if (ts.isIdentifier(s)) {
      const def = resolveBare(s.text, { file, scopes });
      if (def) fnRefs.push(def);
    }
  }
  for (const def of fnRefs) {
    const key = `${def.file}::${def.node.pos}`;
    if (seen.has(key) || seen.size > 6) continue;
    const next = new Set(seen).add(key);
    const body = def.node.body;
    const defScopes = def.scopes ?? [];
    const defConsts = def.file === file ? consts : [];
    if (body && ts.isBlock(body))
      discover(
        body.statements,
        def.file,
        titles,
        hooks,
        next,
        defScopes,
        defConsts,
      );
    else if (body)
      discoverStatement(
        ts.factory.createExpressionStatement(body),
        def.file,
        titles,
        hooks,
        next,
        defScopes,
        defConsts,
      );
  }
}

// ---------- run ----------

const tests = JSON.parse(fs.readFileSync(TESTS_FILE, "utf8")).tests;
const specs = [...new Set(tests.map((t) => t.spec))];
const bySpec = new Map();
for (const spec of specs) {
  const file = path.join(E2E, spec);
  if (!fs.existsSync(file)) continue;
  const before = staticTests.length;
  const info = loadFile(file);
  discover(info.sf.statements, file, [], [], new Set(), []);
  bySpec.set(spec, staticTests.slice(before));
}

const out = [];
for (const st of staticTests) {
  const hookEvents = [];
  for (const h of st.hooks.filter((hook) => hook.fn)) {
    const ctx = {
      file: h.file,
      params: new Map(),
      stack: [],
      out: [],
      scopes: h.scopes,
      consts: h.consts,
    };
    walkFunction(h.fn, ctx);
    for (const ev of ctx.out) hookEvents.push({ ...ev, hook: h.kind });
  }
  const ctx = {
    file: st.file,
    params: new Map(),
    stack: [],
    out: [],
    scopes: st.scopes,
    consts: st.consts,
  };
  walkFunction(st.fn, ctx);
  const sf = st.node.getSourceFile();
  st.record = {
    key: `${path.relative(E2E, sf.fileName)}:${sf.getLineAndCharacterOfPosition(st.node.getStart(sf)).line + 1}`,
    titleText: st.titles.map((t) => t.text).join(" "),
    titleRe: "^" + st.titles.map((t) => t.re).join(" ") + "$",
    describeRes: st.titles.slice(0, -1).map((t) => t.re),
    itRe: st.titles.at(-1).re,
    beforeDepths: [
      ...new Set(
        st.hooks.filter((h) => h.kind === "before").map((h) => h.depth),
      ),
    ].sort((a, b) => a - b),
    literal: st.titles.reduce((n, t) => n + t.literal, 0),
    events: [...hookEvents, ...ctx.out],
  };
  out.push(st.record);
}

// Match captured tests to static tests of the same spec, preferring the most literal title.
// Two `it` blocks with the same title run in source order, so the nth test with a repeated title takes the nth of them.
const matches = {};
const occurrences = new Map();
let matched = 0;
for (const t of tests) {
  const candidates = (bySpec.get(t.spec) ?? []).map((s) => s.record);
  let tied = [];
  for (const c of candidates) {
    if (!new RegExp(c.titleRe, "s").test(t.title)) continue;
    if (!tied.length || c.literal > tied[0].literal) tied = [c];
    else if (c.literal === tied[0].literal) tied.push(c);
  }
  const seen = occurrences.get(`${t.spec}\u0000${t.title}`) ?? 0;
  occurrences.set(`${t.spec}\u0000${t.title}`, seen + 1);
  const best = tied[Math.min(seen, tied.length - 1)];
  if (best) {
    matches[t.id] = best.key;
    matched += 1;
  }
}

fs.writeFileSync(
  OUT_FILE,
  JSON.stringify({ staticTests: out, matches, commands: [...commands.keys()] }),
);
const unmatchedSpecs = new Set(
  tests.filter((t) => matches[t.id] === undefined).map((t) => t.spec),
);
console.log(
  `${out.length} static tests, ${matched}/${tests.length} captured tests matched, ` +
    `${unmatchedSpecs.size} specs with unmatched tests`,
);
