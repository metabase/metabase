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

function createWalker(resolver) {
  const { deref, chunkOf, constantString } = resolver;

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

      // `toRouteObjects(<tree>)` and `modalRoute(...)` wrap a subtree.
      if (ts.isIdentifier(callee) && callee.getText() === "toRouteObjects") {
        return unwrap(node.arguments[0], file, notes);
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

      // A route pulled from a plugin registry: follow `PLUGIN_X.y = ...`.
      if (ts.isPropertyAccessExpression(callee)) {
        notes.push({ why: "plugin call", what: callee.getText(), file });
        return null;
      }
    }

    return { node, file };
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
      walk(node.left, file, prefix, inherited, out, notes, depth + 1, bindings);
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
      let chunks = inherited;
      const lazyAttr = attrs.lazy?.expression || attrs.lazy;
      let chunk = null;
      if (lazyAttr) {
        chunk = chunkFor(lazyAttr, file, notes);
        if (chunk) {
          chunks = [...new Set([...inherited, chunk])];
        }
      }
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
      let chunks = inherited;
      let chunk = null;
      if (props.lazy) {
        chunk = chunkFor(props.lazy, file, notes);
        if (chunk) {
          chunks = [...new Set([...inherited, chunk])];
        }
      }
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

  /** The chunk a `lazy` expression loads. */
  function chunkFor(node, file, notes) {
    const direct = chunkOf(node, file);
    if (direct) {
      return direct;
    }

    if (ts.isIdentifier(node)) {
      const declaration = deref(node.getText(), file);
      if (declaration) {
        const chunk = chunkOf(declaration.node, declaration.file);
        if (chunk) {
          return chunk;
        }
      }
      notes.push({ why: "lazy without a chunk", what: node.getText(), file });
      return null;
    }
    // A loader built by a factory: `lazy={appearanceSettings("branding")}`.
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const declaration = deref(node.expression.getText(), file);
      if (declaration) {
        const chunk = chunkOf(declaration.node, declaration.file);
        if (chunk) {
          return chunk;
        }
      }
    }
    if (ts.isPropertyAccessExpression(node)) {
      notes.push({
        why: "lazy from a plugin slot",
        what: node.getText(),
        file,
      });
      return null;
    }
    notes.push({
      why: "lazy not understood",
      what: node.getText().slice(0, 40),
      file,
    });
    return null;
  }

  return { walk, join };
}
