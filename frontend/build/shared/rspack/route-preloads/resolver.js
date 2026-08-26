/* eslint-env node */

/**
 * Resolving names across the source tree, without importing anything.
 *
 * The route tree is assembled by functions spread over ninety files, so finding
 * which chunk serves which URL means following names from one module to the
 * next. Importing them instead would drag in the loaders and the compiled
 * ClojureScript, which is why this reads source rather than running it.
 */
const fs = require("fs");
const path = require("path");

const ts = require("typescript");

/**
 * A resolver over one checkout: parses files on demand, resolves import
 * specifiers the way the build's aliases do, and follows a name to wherever it
 * is really declared.
 */
function createResolver(root) {
  const SRC = [
    path.join(root, "frontend/src"),
    path.join(root, "enterprise/frontend/src"),
    path.join(root, "frontend/test"),
  ];

  const parsed = new Map();

  function parse(file) {
    if (parsed.has(file)) {
      return parsed.get(file);
    }
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    parsed.set(file, source);
    return source;
  }

  /** Resolve an import specifier the way the build's aliases do. */
  function resolve(spec, fromFile) {
    const candidates = [];
    if (spec.startsWith(".")) {
      candidates.push(path.resolve(path.dirname(fromFile), spec));
    } else {
      for (const base of SRC) {
        candidates.push(path.join(base, spec));
      }
    }
    for (const candidate of candidates) {
      for (const suffix of [".tsx", ".ts", "/index.tsx", "/index.ts", ""]) {
        const file = candidate + suffix;
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
          return file;
        }
      }
    }
    return null;
  }

  /** Where a name came from: a local declaration, or an import in another file. */
  function findDeclaration(name, file) {
    const source = parse(file);
    let found = null;

    const visit = (node) => {
      if (found) {
        return;
      }
      if (ts.isVariableDeclaration(node) && node.name.getText() === name) {
        found = { kind: "local", node: node.initializer, file };
      } else if (
        ts.isFunctionDeclaration(node) &&
        node.name?.getText() === name
      ) {
        found = { kind: "local", node, file };
      } else if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        node.exportClause &&
        ts.isNamedExports(node.exportClause)
      ) {
        // `export { getRoutes as getNotificationsRoutes } from "./x"`
        for (const element of node.exportClause.elements) {
          if (element.name.getText() === name) {
            const target = resolve(
              node.moduleSpecifier.getText().slice(1, -1),
              file,
            );
            if (target) {
              found = {
                kind: "import",
                file: target,
                exported: (element.propertyName || element.name).getText(),
              };
            }
          }
        }
      } else if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        const spec = node.moduleSpecifier.getText().slice(1, -1);
        const names = [];
        if (clause?.name) {
          names.push([clause.name.getText(), "default"]);
        }
        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            names.push([
              element.name.getText(),
              (element.propertyName || element.name).getText(),
            ]);
          }
        }
        for (const [local, exported] of names) {
          if (local === name) {
            const target = resolve(spec, file);
            if (target) {
              found = { kind: "import", file: target, exported };
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(source);
    return found;
  }

  /** Follow a name to wherever it is actually declared. */
  function deref(name, file, seen = new Set()) {
    const key = `${file}#${name}`;
    if (seen.has(key)) {
      return null;
    }
    seen.add(key);

    const declaration = findDeclaration(name, file);

    // A name a barrel only re-exports with `export * from "./x"`.
    if (!declaration) {
      const source = parse(file);
      let viaStar = null;
      ts.forEachChild(source, (node) => {
        if (viaStar) {
          return;
        }
        if (
          ts.isExportDeclaration(node) &&
          node.moduleSpecifier &&
          !node.exportClause
        ) {
          const next = resolve(
            node.moduleSpecifier.getText().slice(1, -1),
            file,
          );
          if (next) {
            viaStar = deref(name, next, seen);
          }
        }
      });
      return viaStar;
    }

    if (declaration.kind === "local") {
      return declaration;
    }

    // Follow re-exports: `export * from "./x"` in a barrel.
    const target = parse(declaration.file);
    let reexport = null;
    ts.forEachChild(target, (node) => {
      if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        !node.exportClause
      ) {
        const next = resolve(
          node.moduleSpecifier.getText().slice(1, -1),
          declaration.file,
        );
        if (next && !reexport) {
          const candidate = deref(declaration.exported, next, seen);
          if (candidate) {
            reexport = candidate;
          }
        }
      }
    });
    if (reexport) {
      return reexport;
    }

    return deref(declaration.exported, declaration.file, seen);
  }

  /** The chunk an `import()` in this expression names. */
  function chunkOf(node, file) {
    if (!node) {
      return null;
    }
    let chunk = null;
    const visit = (n) => {
      if (chunk) {
        return;
      }
      if (
        n.kind === ts.SyntaxKind.CallExpression &&
        n.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const text = n.getFullText();
        const match = text.match(/webpackChunkName:\s*"([^"]+)"/);
        if (match) {
          chunk = match[1];
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
    if (chunk) {
      return chunk;
    }
    return null;
  }

  /**
   * The string an expression is, when it is knowable without running anything:
   * a literal, a name bound to one, a namespaced constant, or a template built
   * from those.
   */
  function constantString(node, file, bindings = {}) {
    if (!node) {
      return null;
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return node.text;
    }

    if (ts.isIdentifier(node)) {
      const name = node.getText();
      if (name in bindings) {
        return bindings[name];
      }
      const declaration = deref(name, file);
      return declaration
        ? constantString(declaration.node, declaration.file, {})
        : null;
    }

    // `Urls.CONVERSATION_BASE_PATH`, where Urls is a namespace import.
    if (ts.isPropertyAccessExpression(node)) {
      const namespace = node.expression.getText();
      const member = node.name.getText();
      const source = parse(file);
      let target = null;
      ts.forEachChild(source, (child) => {
        if (
          ts.isImportDeclaration(child) &&
          child.importClause?.namedBindings &&
          ts.isNamespaceImport(child.importClause.namedBindings) &&
          child.importClause.namedBindings.name.getText() === namespace
        ) {
          target = resolve(child.moduleSpecifier.getText().slice(1, -1), file);
        }
      });
      if (!target) {
        return null;
      }
      const declaration = deref(member, target);
      return declaration
        ? constantString(declaration.node, declaration.file, {})
        : null;
    }

    if (ts.isTemplateExpression(node)) {
      let text = node.head.text;
      for (const span of node.templateSpans) {
        const part = constantString(span.expression, file, bindings);
        if (part === null) {
          return null;
        }
        text += part + span.literal.text;
      }
      return text;
    }

    return null;
  }

  return { parse, resolve, findDeclaration, deref, chunkOf, constantString };
}

module.exports = { createResolver };
