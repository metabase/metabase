import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

import { SDK_PACKAGE_NAME } from "embedding-sdk-package/cli/constants/config";

import type { DiscoveredQuery } from "../types";

export interface QuerySource {
  exportName: string;
  filePath: string;
}

interface InspectedQuerySource extends QuerySource {
  object: ts.ObjectLiteralExpression;
  sourceFile: ts.SourceFile;
}

const QUERIES_DIRECTORY_PATH = "queries";
const DATA_APP_MODULE = SDK_PACKAGE_NAME + "/data-app";

const QUERY_FILE_EXTENSIONS = [
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".cjs",
  ".cts",
  ".mjs",
  ".mts",
];

export function findQuerySources(appRoot: string): QuerySource[] {
  return listQueryFiles(path.join(appRoot, QUERIES_DIRECTORY_PATH)).flatMap(
    inspectQueryFile,
  );
}

export function injectSavedQuestionId(query: DiscoveredQuery, id: number) {
  const source = inspectQueryFile(query.filePath).find(
    ({ exportName }) => exportName === query.exportName,
  );
  if (!source) {
    throw new Error(`Could not find ${query.exportName} in ${query.filePath}.`);
  }

  const contents = source.sourceFile.text;
  const existing = source.object.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
      property.name.text === "savedQuestionSourceId",
  );
  const replacement = `savedQuestionSourceId: ${id}`;
  const updated = existing
    ? `${contents.slice(0, existing.getStart(source.sourceFile))}${replacement}${contents.slice(existing.getEnd())}`
    : `${contents.slice(0, source.object.getStart(source.sourceFile) + 1)}\n  ${replacement},${contents.slice(source.object.getStart(source.sourceFile) + 1)}`;
  fs.writeFileSync(query.filePath, updated);
}

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
    .filter(isQueryFile)
    .sort();
}

const isQueryFile = (filePath: string) =>
  QUERY_FILE_EXTENSIONS.some((extension) => filePath.endsWith(extension));

const hasExportModifier = (node: ts.Node) =>
  ts.canHaveModifiers(node)
    ? ts
        .getModifiers(node)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    : false;

function isDataAppImport(
  statement: ts.Statement,
): statement is ts.ImportDeclaration {
  return (
    ts.isImportDeclaration(statement) &&
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text === DATA_APP_MODULE
  );
}

function getDataAppNamedImports(statement: ts.Statement) {
  if (!isDataAppImport(statement)) {
    return undefined;
  }

  const namedBindings = statement.importClause?.namedBindings;

  if (!namedBindings || !ts.isNamedImports(namedBindings)) {
    return undefined;
  }

  return namedBindings.elements;
}

const isDefineQueryImport = (item: ts.ImportSpecifier) =>
  (item.propertyName ?? item.name).text === "defineQuery";

const isDirectVariableInitialization = (
  declaration: ts.Node,
  initializer: ts.CallExpression,
): declaration is ts.VariableDeclaration & { name: ts.Identifier } =>
  ts.isVariableDeclaration(declaration) &&
  declaration.initializer === initializer &&
  ts.isIdentifier(declaration.name);

const isNamedExportStatement = (statement: ts.Node | undefined) =>
  Boolean(
    statement &&
    ts.isVariableStatement(statement) &&
    hasExportModifier(statement),
  );

const queryObjectArgument = (node: ts.CallExpression) => {
  const [argument] = node.arguments;
  return node.arguments.length === 1 && ts.isObjectLiteralExpression(argument)
    ? argument
    : undefined;
};

const isDirectNamedQueryDefinition = (
  node: ts.CallExpression,
  declaration: ts.Node,
  statement: ts.Node | undefined,
): declaration is ts.VariableDeclaration & { name: ts.Identifier } =>
  isDirectVariableInitialization(declaration, node) &&
  isNamedExportStatement(statement);

const isDefineQueryCall = (
  node: ts.Node,
  names: Set<string>,
): node is ts.CallExpression =>
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  names.has(node.expression.text);

function inspectQueryFile(filePath: string): InspectedQuerySource[] {
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
    const namedImports = getDataAppNamedImports(statement);

    if (!namedImports) {
      continue;
    }

    for (const item of namedImports) {
      if (isDefineQueryImport(item)) {
        defineQueryNames.add(item.name.text);
      }
    }
  }

  const querySources: InspectedQuerySource[] = [];

  const visit = (node: ts.Node) => {
    if (isDefineQueryCall(node, defineQueryNames)) {
      const declaration = node.parent;
      const statement = declaration.parent?.parent;
      const object = queryObjectArgument(node);

      if (
        !isDirectNamedQueryDefinition(node, declaration, statement) ||
        !object
      ) {
        throw new Error(
          `${filePath}: defineQuery must directly initialize a named exported variable with one object literal.`,
        );
      }

      querySources.push({
        exportName: declaration.name.text,
        filePath,
        object,
        sourceFile,
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return querySources;
}
