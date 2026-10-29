import crypto from "node:crypto";
import path from "node:path";

const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
const TEST = new Set(["it", "test", "xit", "fit", "xtest"]);
const HOOK = new Set(["beforeEach", "beforeAll", "afterEach", "afterAll"]);

// Reads jest specs into one record per `it` or `test`: the body with locals renamed, what its free names point at,
// the describe hooks around it, and one hash per top-level statement.
export function scanSpecs({ ts, root, files }) {
  const K = ts.SyntaxKind;
  const program = ts.createProgram(
    files.map((f) => path.join(root, f)),
    { allowJs: true, noResolve: true, noLib: true, types: [], noEmit: true, target: ts.ScriptTarget.Latest, jsx: ts.JsxEmit.Preserve },
  );
  const checker = program.getTypeChecker();
  const declMemo = new Map();
  const symbolOf = (id) => {
    try {
      return checker.getSymbolAtLocation(id);
    } catch {
      return undefined;
    }
  };

  const unwrap = (n) => {
    while (
      n &&
      (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isTypeAssertionExpression(n) || ts.isSatisfiesExpression(n))
    ) {
      n = n.expression;
    }
    return n;
  };
  const isTypeOnly = (n) => ts.isTypeNode(n) || n.kind === K.TypeParameter || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n);
  const isPropertyNameSlot = (n) => {
    const p = n.parent;
    return (
      !!p &&
      p.name === n &&
      (ts.isPropertyAssignment(p) ||
        ts.isShorthandPropertyAssignment(p) ||
        ts.isMethodDeclaration(p) ||
        ts.isPropertyDeclaration(p) ||
        ts.isGetAccessorDeclaration(p) ||
        ts.isSetAccessorDeclaration(p))
    );
  };
  const isRenameable = (id) => {
    const p = id.parent;
    if (!p) {
      return false;
    }
    if ((ts.isPropertyAccessExpression(p) && p.name === id) || (ts.isQualifiedName(p) && p.right === id)) {
      return false;
    }
    if ((ts.isBindingElement(p) && p.propertyName === id) || isPropertyNameSlot(id) || (ts.isJsxAttribute(p) && p.name === id)) {
      return false;
    }
    return !((ts.isLabeledStatement(p) || ts.isBreakStatement(p) || ts.isContinueStatement(p)) && p.label === id);
  };
  const within = (d, rootNode) => d.pos >= rootNode.pos && d.end <= rootNode.end && d.getSourceFile() === rootNode.getSourceFile();
  const findAncestor = (n, pred) => {
    while (n) {
      if (pred(n)) {
        return n;
      }
      n = n.parent;
    }
    return undefined;
  };

  // Token stream without whitespace, comments, parentheses or types. With `alphaRoot`, names declared inside it are numbered.
  function ser(node, { alphaRoot = null } = {}) {
    const out = [];
    const renames = new Map();
    const identTok = (id, sym) => {
      if (alphaRoot && isRenameable(id)) {
        sym ??= symbolOf(id);
        if (sym?.declarations?.some((d) => within(d, alphaRoot))) {
          if (!renames.has(sym)) {
            renames.set(sym, `L${renames.size}`);
          }
          return `I:${renames.get(sym)}`;
        }
      }
      return `I:${id.text}`;
    };
    const visit = (n) => {
      n = unwrap(n);
      if (!n || isTypeOnly(n) || n.kind === K.EmptyStatement) {
        return;
      }
      if (alphaRoot && ts.isShorthandPropertyAssignment(n)) {
        out.push("(SPA", `K:${n.name.text}`, identTok(n.name, checker.getShorthandAssignmentValueSymbol(n)), ")");
        return;
      }
      if (isPropertyNameSlot(n) && (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))) {
        out.push(`K:${n.text}`);
        return;
      }
      switch (n.kind) {
        case K.StringLiteral:
        case K.NoSubstitutionTemplateLiteral:
          out.push(`s:${JSON.stringify(n.text)}`);
          return;
        case K.NumericLiteral:
          out.push(`n:${Number(n.text.replace(/_/g, ""))}`);
          return;
        case K.RegularExpressionLiteral:
        case K.TemplateHead:
        case K.TemplateMiddle:
        case K.TemplateTail:
          out.push(`t:${JSON.stringify(n.text)}`);
          return;
        case K.Identifier:
          out.push(identTok(n));
          return;
        case K.JsxText:
          if (n.text.trim()) {
            out.push(`s:${JSON.stringify(n.text.trim())}`);
          }
          return;
      }
      out.push(`(${K[n.kind]}`);
      if (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) {
        out.push(`op${n.operator}`);
      }
      if (ts.isArrowFunction(n) && !ts.isBlock(n.body)) {
        out.push("concise");
      }
      ts.forEachChild(n, visit, (arr) => {
        out.push("[");
        arr.filter((c) => !isTypeOnly(c)).forEach(visit);
        out.push("]");
      });
      out.push(")");
    };
    visit(node);
    return out.join("\u0001");
  }

  // Names a free identifier by what it points at, so two tests only match when their names mean the same thing.
  function closureOf(node, depth = 0) {
    const refs = new Set();
    const sf = node.getSourceFile();
    const visit = (n) => {
      const shorthand = ts.isIdentifier(n) && ts.isShorthandPropertyAssignment(n.parent) && n.parent.name === n;
      if (ts.isIdentifier(n) && (isRenameable(n) || shorthand)) {
        const sym = shorthand ? checker.getShorthandAssignmentValueSymbol(n.parent) : symbolOf(n);
        const decls = sym?.declarations ?? [];
        if (!decls.length) {
          refs.add(`g:${n.text}`);
        } else if (!decls.some((d) => within(d, node))) {
          refs.add(`${n.text}=${declSig(decls[0], sf, depth)}`);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
    return [...refs].sort();
  }

  function declSig(d, sf, depth) {
    if (declMemo.has(d)) {
      return declMemo.get(d);
    }
    let sig;
    const imp = findAncestor(d, ts.isImportDeclaration);
    if (imp) {
      let spec = imp.moduleSpecifier.text;
      if (spec.startsWith(".")) {
        spec = path.relative(root, path.resolve(path.dirname(sf.fileName), spec));
      }
      const name = ts.isImportSpecifier(d) ? (d.propertyName ?? d.name).text : ts.isNamespaceImport(d) ? "*" : "default";
      sig = `import:${spec}#${name}`;
    } else if (d.getSourceFile() !== sf) {
      sig = `ext:${path.relative(root, d.getSourceFile().fileName)}`;
    } else if (depth > 5) {
      sig = "deep";
    } else {
      declMemo.set(d, "cycle");
      sig =
        ts.isParameter(d) || (ts.isBindingElement(d) && findAncestor(d, ts.isParameter))
          ? `param:${hash(ser(d))}`
          : `decl:${hash(ser(d, { alphaRoot: d }) + "\u0002" + closureOf(d, depth + 1).join("|"))}`;
    }
    declMemo.set(d, sig);
    return sig;
  }

  function calleeInfo(call) {
    let e = call.expression;
    let each = false;
    if (ts.isCallExpression(e) || ts.isTaggedTemplateExpression(e)) {
      const inner = ts.isCallExpression(e) ? e.expression : e.tag;
      if (!(ts.isPropertyAccessExpression(inner) && inner.name.text === "each")) {
        return null;
      }
      each = true;
      e = inner.expression;
    }
    let mod = null;
    if (ts.isPropertyAccessExpression(e)) {
      mod = e.name.text;
      e = e.expression;
      if (ts.isPropertyAccessExpression(e)) {
        mod = `${e.name.text}.${mod}`;
        e = e.expression;
      }
    }
    if (!ts.isIdentifier(e)) {
      return null;
    }
    const name = e.text;
    if (TEST.has(name)) {
      return { kind: "test", name, mod, each };
    }
    if (name === "describe" || name === "xdescribe" || name === "fdescribe") {
      return { kind: "describe", name, mod, each };
    }
    return HOOK.has(name) ? { kind: "hook", name } : null;
  }
  const titleText = (n) => {
    n = unwrap(n);
    if (!n) {
      return "?";
    }
    return ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : n.getText();
  };
  const fnArg = (call) => call.arguments.find((a) => ts.isArrowFunction(unwrap(a)) || ts.isFunctionExpression(unwrap(a)));
  const isExpect = (st) => {
    let found = false;
    const v = (n) => {
      if (found) {
        return;
      }
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "expect") {
        found = true;
        return;
      }
      ts.forEachChild(n, v);
    };
    v(st);
    return found;
  };
  const inLoop = (call, stop) => {
    for (let n = call.parent; n && n !== stop; n = n.parent) {
      if (ts.isForOfStatement(n) || ts.isForStatement(n) || ts.isFunctionDeclaration(n)) {
        return true;
      }
      if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && !(ts.isCallExpression(n.parent) && calleeInfo(n.parent))) {
        return true;
      }
    }
    return false;
  };

  const records = [];
  for (const file of files) {
    const sf = program.getSourceFile(path.join(root, file));
    if (!sf) {
      continue;
    }
    const walk = (n, ctx) => {
      if (ts.isCallExpression(n)) {
        const info = calleeInfo(n);
        if (info?.kind === "describe") {
          const fn = fnArg(n);
          const next = { titles: [...ctx.titles, titleText(n.arguments[0])], hooks: [...ctx.hooks], describeNode: fn ?? n, each: ctx.each || info.each };
          if (fn) {
            const body = unwrap(fn).body;
            for (const st of ts.isBlock(body) ? body.statements : []) {
              const ci = ts.isExpressionStatement(st) && ts.isCallExpression(st.expression) ? calleeInfo(st.expression) : null;
              if (ci?.kind === "hook") {
                const h = fnArg(st.expression);
                if (h) {
                  next.hooks.push(`${ci.name}:${hash(ser(unwrap(h).body, { alphaRoot: unwrap(h) }) + closureOf(unwrap(h)).join("|"))}`);
                }
              } else if (!ci && ts.isExpressionStatement(st)) {
                next.hooks.push(`stmt:${hash(ser(st) + closureOf(st).join("|"))}`);
              }
            }
            ts.forEachChild(body, (c) => walk(c, next));
          }
          return;
        }
        if (info?.kind === "test" && info.mod !== "todo") {
          const fn = fnArg(n);
          if (fn) {
            const f = unwrap(fn);
            const stmts = ts.isBlock(f.body) ? f.body.statements : [f.body];
            const closureList = closureOf(f);
            records.push({
              file,
              line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
              title: [...ctx.titles, titleText(n.arguments[0])].join(" "),
              body: hash(ser(f.body, { alphaRoot: f })),
              closure: hash(closureList.join("|")),
              closureList,
              setup: hash(ctx.hooks.join("|")),
              stmtSigs: stmts.map((s) => hash(ser(s))),
              expects: stmts.filter(isExpect).length,
              repeated: info.each || ctx.each || inLoop(n, ctx.describeNode),
              tokens: ser(f.body).split("\u0001").length,
            });
          }
          return;
        }
      }
      ts.forEachChild(n, (c) => walk(c, ctx));
    };
    walk(sf, { titles: [], hooks: [], describeNode: sf, each: false });
  }
  return records;
}

// Exact copies have the same body after renaming locals, the same target for every free name and the same hooks, and at least 25 tokens, since one-line checks repeat on purpose.
// Prefix pairs have the same hooks, and one test's statements are the opening statements of the other's.
export function findDuplicates(records, involves) {
  const out = [];
  const seen = new Set();
  const add = (kind, a, b) => {
    const key = [kind, `${a.file}:${a.line}`, `${b.file}:${b.line}`].join("|");
    if (!seen.has(key) && (involves(a) || involves(b))) {
      seen.add(key);
      out.push({ kind, a, b });
    }
  };
  for (let i = 0; i < records.length; i++) {
    for (let j = 0; j < records.length; j++) {
      if (i === j) {
        continue;
      }
      const a = records[i];
      const b = records[j];
      if (i < j && a.body === b.body && a.closure === b.closure && a.setup === b.setup && a.tokens >= 25 && b.tokens >= 25) {
        add("exact copy", a, b);
      }
      const shorter = a.stmtSigs;
      const longer = b.stmtSigs;
      if (
        a.setup === b.setup &&
        a.expects > 0 &&
        !a.repeated &&
        !b.repeated &&
        shorter.length < longer.length &&
        shorter.every((s, k) => longer[k] === s) &&
        (a.file === b.file || a.closureList.every((c) => b.closureList.includes(c)))
      ) {
        add("prefix", a, b);
      }
    }
  }
  return out;
}
