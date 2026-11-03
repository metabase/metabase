#!/usr/bin/env node
// Prints the public surface of TypeScript files for the blind generator's context.
//
//   node ts-surface.mjs surface <file> [--touched 12-30,41-41]
//   node ts-surface.mjs harness <spec-file>
//
// Run it from the root of a checkout that has node_modules installed.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "noop.js"));
const ts = require("typescript");

const BODY = "__BODY_ELIDED__";
const EXPR = "__EXPR_ELIDED__";
const TEST_BLOCKS = new Set(["describe", "it", "test"]);
const MAX_HARNESS_LINES = 200;

function parse(file) {
  const text = readFileSync(file, "utf8");
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
}

function hasModifier(node, kind) {
  return (ts.getModifiers?.(node) ?? []).some((m) => m.kind === kind);
}

const isExported = (node) => hasModifier(node, ts.SyntaxKind.ExportKeyword);

function declaredNames(statement) {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations
      .map((d) => (ts.isIdentifier(d.name) ? d.name.text : null))
      .filter(Boolean);
  }
  return statement.name && ts.isIdentifier(statement.name)
    ? [statement.name.text]
    : [];
}

// Names a file exports indirectly, as in `export default connect(...)(Foo)` or `export { Foo }`.
function referencedByExports(sourceFile) {
  const names = new Set();
  const collect = (node) => {
    if (ts.isIdentifier(node)) {
      names.add(node.text);
    }
    ts.forEachChild(node, collect);
  };
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      collect(statement.expression);
    } else if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier
    ) {
      statement.exportClause?.elements?.forEach((el) =>
        names.add((el.propertyName ?? el.name).text),
      );
    } else if (ts.isVariableStatement(statement) && isExported(statement)) {
      statement.declarationList.declarations.forEach((d) => {
        if (d.initializer && ts.isCallExpression(d.initializer)) {
          d.initializer.arguments.forEach((arg) => {
            if (ts.isIdentifier(arg)) {
              names.add(arg.text);
            }
          });
        }
      });
    }
  }
  return names;
}

function elideBodies(context) {
  const f = context.factory;
  const placeholderBlock = () =>
    f.createBlock([f.createExpressionStatement(f.createIdentifier(BODY))]);
  const visit = (node) => {
    if (
      (ts.isPropertyDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)) &&
      (hasModifier(node, ts.SyntaxKind.PrivateKeyword) ||
        ts.isPrivateIdentifier(node.name))
    ) {
      return undefined;
    }
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isConstructorDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)) &&
      node.body
    ) {
      const visited = ts.visitEachChild(node, visit, context);
      return ts.isFunctionDeclaration(node)
        ? f.updateFunctionDeclaration(
            visited,
            visited.modifiers,
            visited.asteriskToken,
            visited.name,
            visited.typeParameters,
            visited.parameters,
            visited.type,
            placeholderBlock(),
          )
        : ts.isFunctionExpression(node)
          ? f.updateFunctionExpression(
              visited,
              visited.modifiers,
              visited.asteriskToken,
              visited.name,
              visited.typeParameters,
              visited.parameters,
              visited.type,
              placeholderBlock(),
            )
          : ts.isMethodDeclaration(node)
            ? f.updateMethodDeclaration(
                visited,
                visited.modifiers,
                visited.asteriskToken,
                visited.name,
                visited.questionToken,
                visited.typeParameters,
                visited.parameters,
                visited.type,
                placeholderBlock(),
              )
            : ts.isConstructorDeclaration(node)
              ? f.updateConstructorDeclaration(
                  visited,
                  visited.modifiers,
                  visited.parameters,
                  placeholderBlock(),
                )
              : ts.isGetAccessorDeclaration(node)
                ? f.updateGetAccessorDeclaration(
                    visited,
                    visited.modifiers,
                    visited.name,
                    visited.parameters,
                    visited.type,
                    placeholderBlock(),
                  )
                : f.updateSetAccessorDeclaration(
                    visited,
                    visited.modifiers,
                    visited.name,
                    visited.parameters,
                    placeholderBlock(),
                  );
    }
    if (ts.isArrowFunction(node)) {
      const visited = ts.visitEachChild(node, visit, context);
      return f.updateArrowFunction(
        visited,
        visited.modifiers,
        visited.typeParameters,
        visited.parameters,
        visited.type,
        visited.equalsGreaterThanToken,
        ts.isBlock(node.body) ? placeholderBlock() : f.createIdentifier(EXPR),
      );
    }
    return ts.visitEachChild(node, visit, context);
  };
  return (root) => ts.visitNode(root, visit);
}

function printStatements(sourceFile, statements, transform) {
  const printer = ts.createPrinter({ removeComments: false });
  const out = [];
  for (const statement of statements) {
    const node = transform
      ? ts.transform(statement, [transform]).transformed[0]
      : statement;
    out.push(printer.printNode(ts.EmitHint.Unspecified, node, sourceFile));
  }
  return out
    .join("\n\n")
    .replace(new RegExp(`\\{\\s*${BODY};\\s*\\}`, "g"), "{ … }")
    .replace(new RegExp(EXPR, "g"), "…");
}

function parseRanges(spec) {
  if (!spec) {
    return [];
  }
  return spec
    .split(",")
    .filter(Boolean)
    .map((r) => r.split("-").map(Number));
}

function surface(file, touchedSpec) {
  const sourceFile = parse(file);
  const indirect = referencedByExports(sourceFile);
  const touchedRanges = parseRanges(touchedSpec);
  const kept = [];
  const touched = [];
  let internalTouched = false;

  for (const statement of sourceFile.statements) {
    const names = declaredNames(statement);
    const keep =
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isExportAssignment(statement) ||
      ts.isExportDeclaration(statement) ||
      ((ts.isFunctionDeclaration(statement) ||
        ts.isVariableStatement(statement) ||
        ts.isClassDeclaration(statement)) &&
        (isExported(statement) || names.some((n) => indirect.has(n))));

    const start =
      sourceFile.getLineAndCharacterOfPosition(statement.getStart()).line + 1;
    const end =
      sourceFile.getLineAndCharacterOfPosition(statement.getEnd()).line + 1;
    const isTouched = touchedRanges.some(([a, b]) => a <= end && b >= start);

    if (keep) {
      kept.push(statement);
      if (isTouched) {
        touched.push(names.length > 0 ? names.join(", ") : "export statement");
      }
    } else if (isTouched && !ts.isImportDeclaration(statement)) {
      internalTouched = true;
    }
  }

  const lines = [];
  if (touchedRanges.length > 0) {
    const parts = [...touched];
    if (internalTouched) {
      parts.push("non-exported code in this file");
    }
    lines.push(
      `Changed by the PR: ${parts.length > 0 ? parts.join("; ") : "imports only"}`,
      "",
    );
  }
  lines.push(printStatements(sourceFile, kept, elideBodies));
  return lines.join("\n");
}

function isTestBlock(statement) {
  if (!ts.isExpressionStatement(statement)) {
    return false;
  }
  let callee = statement.expression;
  while (ts.isCallExpression(callee) || ts.isPropertyAccessExpression(callee)) {
    callee = ts.isCallExpression(callee)
      ? callee.expression
      : callee.expression;
  }
  return ts.isIdentifier(callee) && TEST_BLOCKS.has(callee.text);
}

function harness(file) {
  const sourceFile = parse(file);
  const kept = sourceFile.statements.filter((s) => !isTestBlock(s));
  const text = printStatements(sourceFile, kept, null);
  const lines = text.split("\n");
  if (lines.length <= MAX_HARNESS_LINES) {
    return text;
  }
  return [
    ...lines.slice(0, MAX_HARNESS_LINES),
    `// … ${lines.length - MAX_HARNESS_LINES} more lines cut`,
  ].join("\n");
}

const [mode, file, flag, value] = process.argv.slice(2);
if (mode === "surface" && file) {
  process.stdout.write(surface(file, flag === "--touched" ? value : "") + "\n");
} else if (mode === "harness" && file) {
  process.stdout.write(harness(file) + "\n");
} else {
  process.stderr.write(
    "usage: ts-surface.mjs surface <file> [--touched a-b,c-d] | harness <spec-file>\n",
  );
  process.exit(2);
}
