/* eslint-env node */

/**
 * Walking the route tree as source.
 *
 * Every route is reported, whether or not it loads its page on demand, so that
 * callers can ask different questions of the same walk: which chunk serves a
 * URL, which parameters a URL takes, which routes exist at all.
 *
 * Conditionals are over-approximated: both branches are taken, so a route only
 * some instances reach is still reported. That is what lets this see the
 * enterprise routes that building the tree in a test cannot.
 */
const ts = require("typescript");

module.exports = { createWalker };

function createWalker(resolver, slotWrites = new Map()) {
  const { deref, chunkOf, constantString } = resolver;

  const SLOT_NAME = /^PLUGIN_[A-Z0-9_]+$/;

  /** `PLUGIN_X.member`, the name a route tree uses to reach a slot. */
  function slotKey(node) {
    if (
      !node ||
      !ts.isPropertyAccessExpression(node) ||
      !ts.isIdentifier(node.expression) ||
      !SLOT_NAME.test(node.expression.text)
    ) {
      return null;
    }
    return `${node.expression.text}.${node.name.text}`;
  }

  /**
   * Everything written to a slot, as somewhere to walk.
   *
   * A plugin picks between an upsell page and the real one, so a slot has more
   * than one writer and both can render. Every one is followed, the same way a
   * conditional route takes both branches.
   */
  function slotTargets(node) {
    const key = slotKey(node);
    const written =
      (key && slotWrites.get(key)) ||
      // `PLUGIN_X.map(...)` reads an array slot that `push` fills.
      (key && slotWrites.get(key.split(".")[0])) ||
      [];

    return written.flatMap(({ value, file }) => {
      if (ts.isIdentifier(value)) {
        const declaration = deref(value.getText(), file);
        return declaration
          ? [{ node: declaration.node, file: declaration.file }]
          : [];
      }
      return [{ node: value, file }];
    });
  }

  /** The parameters a pattern takes, in the order they appear. */
  const paramsOf = (pattern) =>
    pattern
      .split("/")
      .filter((segment) => segment.startsWith(":"))
      .map((segment) => segment.slice(1));

  /**
   * One entry per route, not per URL. An index route and the layout it sits in
   * share a pattern and are reported separately, because they can load
   * different chunks.
   */
  const record = (out, route) => {
    out.push({ ...route, params: paramsOf(route.pattern) });
  };

  const join = (prefix, segment) => {
    if (!segment) {
      return prefix;
    }
    if (segment.startsWith("/")) {
      return segment;
    }
    return `${prefix === "/" ? "" : prefix}/${segment}`.replace(/\/{2,}/g, "/");
  };

  const stringOf = (node, file, bindings) =>
    node
      ? constantString(
          ts.isJsxExpression(node) ? node.expression : node,
          file,
          bindings,
        )
      : null;

  /** What a function gives back, so a slot holding one can be walked. */
  function returnedBy(node) {
    const fn = ts.isVariableDeclaration(node) ? node.initializer : node;
    if (
      !fn ||
      !(
        ts.isArrowFunction(fn) ||
        ts.isFunctionDeclaration(fn) ||
        ts.isFunctionExpression(fn)
      )
    ) {
      return node;
    }
    if (!fn.body) {
      return node;
    }
    if (!ts.isBlock(fn.body)) {
      return fn.body;
    }
    let returned = null;
    for (const statement of fn.body.statements) {
      if (ts.isReturnStatement(statement) && statement.expression) {
        returned = statement.expression;
      }
    }
    return returned ?? node;
  }

  /** Unwrap the expression a route helper or a name stands for. */
  function unwrap(node, file, notes) {
    if (!node) {
      return null;
    }

    if (ts.isParenthesizedExpression(node)) {
      return unwrap(node.expression, file, notes);
    }
    if (ts.isAsExpression(node)) {
      return unwrap(node.expression, file, notes);
    }

    if (ts.isIdentifier(node)) {
      const declaration = deref(node.getText(), file);
      if (!declaration) {
        notes.push({ why: "unknown identifier", what: node.getText(), file });
        return null;
      }
      return { node: declaration.node, file: declaration.file };
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression;

      // `toRouteObjects(<tree>)` wraps a subtree, which can itself be a slot
      // call, so the argument goes back through `walk` rather than `deref`.
      if (ts.isIdentifier(callee) && callee.getText() === "toRouteObjects") {
        return { node: node.arguments[0], file };
      }

      if (ts.isIdentifier(callee)) {
        const declaration = deref(callee.getText(), file);
        if (!declaration) {
          notes.push({ why: "unknown call", what: callee.getText(), file });
          return null;
        }
        const body = declaration.node;
        const fn =
          ts.isFunctionDeclaration(body) ||
          ts.isArrowFunction(body) ||
          ts.isFunctionExpression(body)
            ? body
            : null;
        if (!fn) {
          return { node: body, file: declaration.file };
        }

        if (fn.body && ts.isBlock(fn.body)) {
          let returned = null;
          for (const statement of fn.body.statements) {
            if (ts.isReturnStatement(statement) && statement.expression) {
              returned = statement.expression;
            }
          }
          return returned ? { node: returned, file: declaration.file } : null;
        }
        return { node: fn.body, file: declaration.file };
      }

      // A route pulled from a plugin registry. `walk` follows every writer,
      // so this only reports a slot nothing writes.
      if (ts.isPropertyAccessExpression(callee)) {
        if (slotTargets(callee).length === 0) {
          notes.push({ why: "plugin call", what: callee.getText(), file });
        }
        return null;
      }
    }

    return { node, file };
  }

  /**
   * The values behind a slot read: `{PLUGIN_ARRAY_SLOT}` rendered as children,
   * or `{PLUGIN_X.someRoute}` holding the routes themselves. Null when the node
   * is not a slot read.
   */
  function slotReadValues(node) {
    if (ts.isIdentifier(node) && SLOT_NAME.test(node.getText())) {
      return (slotWrites.get(node.getText()) ?? []).map(({ value, file }) => ({
        node: value,
        file,
      }));
    }
    if (ts.isPropertyAccessExpression(node) && slotKey(node)) {
      return slotTargets(node);
    }
    return null;
  }

  /**
   * The sides of `a ?? b` worth walking. Every instance fills a slot, so when
   * the left side is a filled slot the fallback never runs; it only runs in a
   * build without the plugins, whose routes are a subset of the slot's.
   */
  function nullishSides(node) {
    if (slotKey(node.left) && slotTargets(node.left).length > 0) {
      return [node.left];
    }
    return [node.left, node.right];
  }

  /**
   * Routes reached through a plugin slot. Every writer is walked, since any of
   * them can render, the same way a conditional route takes both branches.
   *
   * @returns whether the node was a slot call, so the caller can stop.
   */
  function walkSlotCall(node, file, prefix, inherited, out, notes, depth) {
    if (!ts.isCallExpression(node)) {
      return false;
    }

    let callee = node.expression;
    while (ts.isParenthesizedExpression(callee)) {
      callee = callee.expression;
    }

    // `(PLUGIN_X.getRoutes ?? fallback)()`: every instance fills the slot, so
    // the fallback only runs in a build without the plugins, whose routes are a
    // subset of the slot's by construction.
    if (
      ts.isBinaryExpression(callee) &&
      callee.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      const viaSlot = slotTargets(callee.left);
      if (viaSlot.length > 0) {
        callee = callee.left;
      } else {
        callee = callee.right;
        if (ts.isIdentifier(callee)) {
          const declaration = deref(callee.getText(), file);
          if (declaration) {
            walk(
              returnedBy(declaration.node),
              declaration.file,
              prefix,
              inherited,
              out,
              notes,
              depth + 1,
            );
            return true;
          }
        }
      }
    }

    const targets = slotTargets(callee);
    if (targets.length === 0) {
      return false;
    }

    const before = out.length;
    for (const target of targets) {
      walk(
        returnedBy(target.node),
        target.file,
        prefix,
        inherited,
        out,
        notes,
        depth + 1,
      );
    }

    // Following a write that yields no route is as invisible as not following
    // it, so it is reported either way.
    if (out.length === before) {
      notes.push({ why: "plugin call", what: node.expression.getText(), file });
    }

    return true;
  }

  /** What a route's `lazy` adds to the chunks it inherits. */
  function chunksWith(inherited, lazyNode, file, notes) {
    const found = lazyNode ? chunksFor(lazyNode, file, notes) : [];

    return {
      chunk: found[0] ?? null,
      chunks:
        found.length > 0 ? [...new Set([...inherited, ...found])] : inherited,
    };
  }

  /** Every route the expression declares, as {pattern, chunks}. */
  function walk(
    node,
    file,
    prefix,
    inherited,
    out,
    notes,
    depth = 0,
    bindings = {},
  ) {
    if (!node || depth > 40) {
      return;
    }

    // `PLUGIN_X.getRoutes()` and `PLUGIN_X.map(...)` both reach routes a plugin
    // wrote at runtime.
    if (walkSlotCall(node, file, prefix, inherited, out, notes, depth)) {
      return;
    }

    const slotValues = slotReadValues(node);
    if (slotValues) {
      for (const target of slotValues) {
        walk(
          returnedBy(target.node),
          target.file,
          prefix,
          inherited,
          out,
          notes,
          depth + 1,
        );
      }
      return;
    }

    if (ts.isParenthesizedExpression(node)) {
      return walk(
        node.expression,
        file,
        prefix,
        inherited,
        out,
        notes,
        depth + 1,
        bindings,
      );
    }
    if (ts.isJsxFragment(node)) {
      for (const child of node.children) {
        walk(child, file, prefix, inherited, out, notes, depth + 1, bindings);
      }
      return;
    }
    if (ts.isJsxExpression(node)) {
      return walk(
        node.expression,
        file,
        prefix,
        inherited,
        out,
        notes,
        depth + 1,
        bindings,
      );
    }
    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements) {
        walk(element, file, prefix, inherited, out, notes, depth + 1, bindings);
      }
      return;
    }
    if (ts.isSpreadElement(node)) {
      const target = unwrap(node.expression, file, notes);
      if (target) {
        walk(
          target.node,
          target.file,
          prefix,
          inherited,
          out,
          notes,
          depth + 1,
        );
      }
      return;
    }
    // Over-approximate: a conditional route is taken.
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      return walk(
        node.right,
        file,
        prefix,
        inherited,
        out,
        notes,
        depth + 1,
        bindings,
      );
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      for (const side of nullishSides(node)) {
        walk(side, file, prefix, inherited, out, notes, depth + 1, bindings);
      }
      return;
    }
    if (ts.isConditionalExpression(node)) {
      walk(
        node.whenTrue,
        file,
        prefix,
        inherited,
        out,
        notes,
        depth + 1,
        bindings,
      );
      return walk(
        node.whenFalse,
        file,
        prefix,
        inherited,
        out,
        notes,
        depth + 1,
        bindings,
      );
    }

    // `PATHS.map((path) => <Route path={path} …/>)`, where PATHS is a constant
    // array of literals. The only idiom here that needs a value bound to a name.
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.getText() === "map"
    ) {
      const source = unwrap(node.expression.expression, file, notes);
      const fn = node.arguments[0];
      if (
        source &&
        ts.isArrayLiteralExpression(source.node) &&
        fn &&
        ts.isArrowFunction(fn)
      ) {
        const parameter = fn.parameters[0]?.name.getText();
        for (const element of source.node.elements) {
          const value = constantString(element, source.file, bindings);
          if (value === null || !parameter) {
            continue;
          }
          walk(fn.body, file, prefix, inherited, out, notes, depth + 1, {
            ...bindings,
            [parameter]: value,
          });
        }
        return;
      }
    }

    // <Route path="x" lazy={loader}>children</Route>
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const name = opening.tagName.getText();
      const attrs = {};
      for (const attribute of opening.attributes.properties) {
        if (ts.isJsxAttribute(attribute)) {
          attrs[attribute.name.getText()] = attribute.initializer;
        }
      }

      if (name !== "Route") {
        const children = ts.isJsxElement(node) ? node.children : [];
        for (const child of children) {
          walk(child, file, prefix, inherited, out, notes, depth + 1);
        }
        return;
      }

      const segment = stringOf(attrs.path, file, bindings);
      const here = join(prefix, segment);
      const lazyAttr = attrs.lazy?.expression || attrs.lazy;
      // A slot holding the upsell page and the real one names both, and a URL
      // can render either, so both are carried.
      const { chunk, chunks } = chunksWith(inherited, lazyAttr, file, notes);
      record(out, {
        pattern: here,
        chunks,
        chunk,
        file,
        isLazy: Boolean(lazyAttr),
      });
      const children = ts.isJsxElement(node) ? node.children : [];
      for (const child of children) {
        walk(child, file, here, chunks, out, notes, depth + 1, bindings);
      }
      return;
    }

    // { path: "x", lazy: loader, children: [...] }
    if (ts.isObjectLiteralExpression(node)) {
      const props = {};
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property)) {
          props[property.name.getText()] = property.initializer;
        }
        if (ts.isSpreadAssignment(property)) {
          const target = unwrap(property.expression, file, notes);
          if (target) {
            walk(
              target.node,
              target.file,
              prefix,
              inherited,
              out,
              notes,
              depth + 1,
            );
          }
        }
      }
      const here = join(prefix, stringOf(props.path, file, bindings));
      const { chunk, chunks } = chunksWith(inherited, props.lazy, file, notes);
      record(out, {
        pattern: here,
        chunks,
        chunk,
        file,
        isLazy: Boolean(props.lazy),
      });
      if (props.children) {
        walk(
          props.children,
          file,
          here,
          chunks,
          out,
          notes,
          depth + 1,
          bindings,
        );
      }
      return;
    }

    if (ts.isIdentifier(node) || ts.isCallExpression(node)) {
      const target = unwrap(node, file, notes);
      if (target && target.node !== node) {
        walk(
          target.node,
          target.file,
          prefix,
          inherited,
          out,
          notes,
          depth + 1,
          bindings,
        );
      }
    }
  }

  /**
   * Route helpers whose loader renders a modal. A modal opens after its page
   * has rendered, so it is never worth preloading, and its chunk is skipped on
   * purpose rather than reported as unreadable.
   */
  const MODAL_HELPERS = new Set([
    "lazyModalComponent",
    "lazyModalRouteElement",
  ]);

  /**
   * The chunks a `lazy` expression loads, following the shapes a loader is
   * written in: a plain `import()`, a name bound to one, a factory call, and
   * `featureGatedRoute`, whose two pages are both reported because either can
   * render.
   *
   * `loaderBindings` maps a helper's parameter names to the expressions the
   * call passed, so `gated(somePage)` resolves `somePage` where the helper's
   * body only names the parameter.
   */
  function chunksFor(node, file, notes, loaderBindings = {}, depth = 0) {
    if (!node || depth > 20) {
      return [];
    }

    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
      return chunksFor(node.expression, file, notes, loaderBindings, depth + 1);
    }

    const direct = chunkOf(node, file);
    if (direct) {
      return [direct];
    }

    if (ts.isIdentifier(node)) {
      // `Promise.resolve(...)` in a chunk-free loader ends up here.
      if (node.getText() === "Promise") {
        return [];
      }
      const bound = loaderBindings[node.getText()];
      if (bound) {
        return chunksFor(
          bound.node,
          bound.file,
          notes,
          bound.bindings,
          depth + 1,
        );
      }
      const declaration = deref(node.getText(), file);
      if (!declaration) {
        notes.push({ why: "unknown identifier", what: node.getText(), file });
        return [];
      }
      const found = chunksFor(
        declaration.node,
        declaration.file,
        notes,
        {},
        depth + 1,
      );
      if (found.length === 0 && loadsAChunk(declaration.node)) {
        notes.push({ why: "lazy without a chunk", what: node.getText(), file });
      }
      return found;
    }

    if (ts.isCallExpression(node)) {
      let callee = node.expression;
      while (ts.isParenthesizedExpression(callee)) {
        callee = callee.expression;
      }

      if (ts.isIdentifier(callee)) {
        const name = callee.getText();

        if (MODAL_HELPERS.has(name)) {
          return [];
        }

        // Both pages of a gated route are carried: a hint nobody uses costs a
        // download, a missing hint costs a page.
        if (name === "featureGatedRoute") {
          return [
            ...new Set([
              ...chunksFor(
                node.arguments[1],
                file,
                notes,
                loaderBindings,
                depth + 1,
              ),
              ...chunksFor(
                node.arguments[2],
                file,
                notes,
                loaderBindings,
                depth + 1,
              ),
            ]),
          ];
        }

        const declaration = deref(name, file);
        if (!declaration) {
          notes.push({ why: "unknown call", what: name, file });
          return [];
        }
        const fn = ts.isVariableDeclaration(declaration.node)
          ? declaration.node.initializer
          : declaration.node;
        if (
          fn &&
          (ts.isArrowFunction(fn) ||
            ts.isFunctionDeclaration(fn) ||
            ts.isFunctionExpression(fn))
        ) {
          const bindings = {};
          fn.parameters.forEach((parameter, index) => {
            if (node.arguments[index]) {
              bindings[parameter.name.getText()] = {
                node: node.arguments[index],
                file,
                bindings: loaderBindings,
              };
            }
          });
          return chunksFor(
            returnedBy(fn),
            declaration.file,
            notes,
            bindings,
            depth + 1,
          );
        }
        return chunksFor(
          declaration.node,
          declaration.file,
          notes,
          {},
          depth + 1,
        );
      }

      if (ts.isPropertyAccessExpression(callee)) {
        if (slotKey(callee)) {
          const targets = slotTargets(callee);
          const found = targets.flatMap((target) =>
            chunksFor(target.node, target.file, notes, {}, depth + 1),
          );
          return [...new Set(found)];
        }
        // `loadPage().then(...)`: the chunk sits behind the call being chained.
        return chunksFor(
          callee.expression,
          file,
          notes,
          loaderBindings,
          depth + 1,
        );
      }
    }

    // A loader's result: no chunk in it means the page is already in a bundle
    // on the page, which needs no hint.
    if (ts.isObjectLiteralExpression(node)) {
      return [];
    }

    if (ts.isPropertyAccessExpression(node)) {
      const targets = slotTargets(node);
      if (targets.length === 0) {
        notes.push({
          why: "lazy from a plugin slot",
          what: node.getText(),
          file,
        });
        return [];
      }
      return [
        ...new Set(
          targets.flatMap((target) =>
            chunksFor(target.node, target.file, notes, {}, depth + 1),
          ),
        ),
      ];
    }

    // `lazy={PLUGIN_X.page ?? fallback}`: the slot side when a plugin fills it,
    // the fallback in a build without the plugins, whose chunks it repeats.
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      if (slotKey(node.left) && slotTargets(node.left).length > 0) {
        return chunksFor(node.left, file, notes, loaderBindings, depth + 1);
      }
      return [
        ...new Set([
          ...chunksFor(node.left, file, notes, loaderBindings, depth + 1),
          ...chunksFor(node.right, file, notes, loaderBindings, depth + 1),
        ]),
      ];
    }

    if (
      ts.isArrowFunction(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node)
    ) {
      // A loader with no `import()` resolves a page already in a bundle on the
      // page, such as `outletRoute`; there is no chunk to find and none to
      // complain about. One with an `import()` but no chunk comment is caught
      // by the identifier branch above, which knows the loader's name.
      const body = returnedBy(node);
      if (body !== node) {
        const viaBody = chunksFor(body, file, notes, loaderBindings, depth + 1);
        if (viaBody.length > 0) {
          return viaBody;
        }
      }
      return [];
    }

    notes.push({
      why: "lazy not understood",
      what: node.getText().slice(0, 40),
      file,
    });
    return [];
  }

  /** Whether an expression's source fetches a chunk at all. */
  function loadsAChunk(node) {
    return Boolean(node) && /\bimport\s*\(/.test(node.getText());
  }

  return { walk, join };
}
