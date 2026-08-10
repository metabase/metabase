import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { build } from "esbuild";
import ts from "typescript";

import { canonicalJson, getQueryFingerprint } from "./canonical";
import type { DiscoveredQuery } from "./types";

interface QuerySource {
  exportName: string;
  filePath: string;
  object: ts.ObjectLiteralExpression;
  sourceFile: ts.SourceFile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const QUERY_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/;

function listQueryFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const itemPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listQueryFiles(itemPath) : [itemPath];
    })
    .filter(
      (filePath) =>
        QUERY_FILE_PATTERN.test(filePath) && !filePath.endsWith(".d.ts"),
    )
    .sort();
}

function hasExportModifier(node: ts.Node) {
  return ts.canHaveModifiers(node)
    ? ts
        .getModifiers(node)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    : false;
}

function inspectQueryFile(filePath: string): QuerySource[] {
  const contents = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    contents,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const defineQueryNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text ===
        "@metabase/embedding-sdk-react/data-app" &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const element of statement.importClause.namedBindings.elements) {
        if ((element.propertyName ?? element.name).text === "defineQuery") {
          defineQueryNames.add(element.name.text);
        }
      }
    }
  }

  const found: QuerySource[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      defineQueryNames.has(node.expression.text)
    ) {
      const declaration = node.parent;
      const statement = declaration.parent?.parent;
      if (
        !ts.isVariableDeclaration(declaration) ||
        declaration.initializer !== node ||
        !ts.isIdentifier(declaration.name) ||
        !statement ||
        !ts.isVariableStatement(statement) ||
        !hasExportModifier(statement) ||
        node.arguments.length !== 1 ||
        !ts.isObjectLiteralExpression(node.arguments[0])
      ) {
        throw new Error(
          `${filePath}: defineQuery must directly initialize a named exported variable with one object literal.`,
        );
      }
      found.push({
        exportName: declaration.name.text,
        filePath,
        object: node.arguments[0],
        sourceFile,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

async function evaluateModule(filePath: string) {
  const result = await build({
    absWorkingDir: path.dirname(filePath),
    bundle: true,
    entryPoints: [filePath],
    format: "cjs",
    packages: "external",
    platform: "node",
    target: "node20",
    write: false,
    logLevel: "silent",
  });
  const compiled = result.outputFiles[0]?.text;
  if (!compiled) {
    throw new Error(`Could not evaluate ${filePath}.`);
  }
  const runtimeModule: { exports: Record<string, unknown> } = { exports: {} };
  const runtimeRequire = createRequire(filePath);
  new Function("require", "module", "exports", compiled)(
    runtimeRequire,
    runtimeModule,
    runtimeModule.exports,
  );
  return runtimeModule.exports;
}

function positiveId(value: unknown, location: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${location} has an invalid savedQuestionSourceId.`);
  }
  return value;
}

export async function discoverQueries(
  appRoot: string,
): Promise<DiscoveredQuery[]> {
  const sources = listQueryFiles(path.join(appRoot, "queries")).flatMap(
    inspectQueryFile,
  );
  const byFile = new Map<string, QuerySource[]>();
  for (const source of sources) {
    byFile.set(source.filePath, [
      ...(byFile.get(source.filePath) ?? []),
      source,
    ]);
  }

  const discovered: DiscoveredQuery[] = [];
  for (const [filePath, fileSources] of byFile) {
    const [first, second] = await Promise.all([
      evaluateModule(filePath),
      evaluateModule(filePath),
    ]);
    for (const source of fileSources) {
      const query = first[source.exportName];
      const repeatedQuery = second[source.exportName];
      const location = `${filePath}:${source.exportName}`;
      if (!isRecord(query)) {
        throw new Error(`${location} did not evaluate to a query object.`);
      }
      if (canonicalJson(query) !== canonicalJson(repeatedQuery)) {
        throw new Error(`${location} is not deterministic.`);
      }
      const savedQuestionSourceId = positiveId(
        query.savedQuestionSourceId,
        location,
      );
      const { tableId, hash } = getQueryFingerprint(query);
      discovered.push({
        exportName: source.exportName,
        filePath,
        query,
        savedQuestionSourceId,
        tableId,
        hash,
      });
    }
  }

  const byId = new Map<number, DiscoveredQuery[]>();
  for (const query of discovered) {
    if (query.savedQuestionSourceId) {
      byId.set(query.savedQuestionSourceId, [
        ...(byId.get(query.savedQuestionSourceId) ?? []),
        query,
      ]);
    }
  }
  for (const [id, conflicts] of byId) {
    if (conflicts.length > 1) {
      const locations = conflicts
        .map(({ filePath, exportName }) => `${filePath}:${exportName}`)
        .join(", ");
      throw new Error(
        `Saved question ${id} is referenced by ${locations}. Remove the ID from the copied definition and sync again.`,
      );
    }
  }
  return discovered;
}

export function injectSavedQuestionId(query: DiscoveredQuery, id: number) {
  const sources = inspectQueryFile(query.filePath);
  const source = sources.find(
    ({ exportName }) => exportName === query.exportName,
  );
  if (!source) {
    throw new Error(`Could not find ${query.exportName} in ${query.filePath}.`);
  }
  const contents = source.sourceFile.text;
  const property = source.object.properties.find(
    (item): item is ts.PropertyAssignment =>
      ts.isPropertyAssignment(item) &&
      ((ts.isIdentifier(item.name) &&
        item.name.text === "savedQuestionSourceId") ||
        (ts.isStringLiteral(item.name) &&
          item.name.text === "savedQuestionSourceId")),
  );
  const updated = property
    ? `${contents.slice(0, property.initializer.getStart(source.sourceFile))}${id}${contents.slice(property.initializer.end)}`
    : `${contents.slice(0, source.object.getStart(source.sourceFile) + 1)}\n  savedQuestionSourceId: ${id},${contents.slice(source.object.getStart(source.sourceFile) + 1)}`;
  fs.writeFileSync(query.filePath, updated);
}
