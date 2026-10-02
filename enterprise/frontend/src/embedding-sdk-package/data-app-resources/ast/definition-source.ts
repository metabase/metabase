import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

import { SDK_PACKAGE_NAME } from "embedding-sdk-package/cli/constants/config";

export interface DefinitionSource {
  exportName: string;
  filePath: string;
}

/** A source-controlled definition kind, and where the CLI looks for it. */
export interface DefinitionKind {
  directory: string;
  factory: string;
  idKey: string;
  /** Article included, so it reads in "did not evaluate to … object". */
  description: string;
}

export const QUERY_DEFINITIONS: DefinitionKind = {
  directory: "queries",
  factory: "defineQuery",
  idKey: "savedQuestionEntityId",
  description: "a query",
};

export const ACTION_DEFINITIONS: DefinitionKind = {
  directory: "actions",
  factory: "defineAction",
  idKey: "copiedActionEntityId",
  description: "an action",
};

const DATA_APP_MODULE = SDK_PACKAGE_NAME + "/data-app";

const DEFINITION_FILE_EXTENSIONS = [
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".cjs",
  ".cts",
  ".mjs",
  ".mts",
];

export function findDefinitionSources(
  appRoot: string,
  kind: DefinitionKind,
): DefinitionSource[] {
  return listDefinitionFiles(path.join(appRoot, kind.directory)).flatMap(
    (filePath) => inspectFile(filePath, kind),
  );
}

function listDefinitionFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const itemPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listDefinitionFiles(itemPath) : [itemPath];
    })
    .filter(isDefinitionFile)
    .sort();
}

const isDefinitionFile = (filePath: string) =>
  DEFINITION_FILE_EXTENSIONS.some((extension) => filePath.endsWith(extension));

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

const isFactoryImport = (item: ts.ImportSpecifier, factory: string) =>
  (item.propertyName ?? item.name).text === factory;

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

const definitionObjectArgument = (node: ts.CallExpression) => {
  const [argument] = node.arguments;
  return node.arguments.length === 1 && ts.isObjectLiteralExpression(argument)
    ? argument
    : undefined;
};

const isDirectNamedDefinition = (
  node: ts.CallExpression,
  declaration: ts.Node,
  statement: ts.Node | undefined,
): declaration is ts.VariableDeclaration & { name: ts.Identifier } =>
  isDirectVariableInitialization(declaration, node) &&
  isNamedExportStatement(statement);

const isFactoryCall = (
  node: ts.Node,
  names: Set<string>,
): node is ts.CallExpression =>
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  names.has(node.expression.text);

function inspectFile(
  filePath: string,
  kind: DefinitionKind,
): DefinitionSource[] {
  const contents = fs.readFileSync(filePath, "utf8");

  const sourceFile = ts.createSourceFile(
    filePath,
    contents,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const factoryNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    const namedImports = getDataAppNamedImports(statement);

    if (!namedImports) {
      continue;
    }

    for (const item of namedImports) {
      if (isFactoryImport(item, kind.factory)) {
        factoryNames.add(item.name.text);
      }
    }
  }

  const definitionSources: DefinitionSource[] = [];

  const visit = (node: ts.Node) => {
    if (isFactoryCall(node, factoryNames)) {
      const declaration = node.parent;
      const statement = declaration.parent?.parent;
      if (
        !isDirectNamedDefinition(node, declaration, statement) ||
        !definitionObjectArgument(node)
      ) {
        throw new Error(
          `${filePath}: ${kind.factory} must directly initialize a named exported variable with one object literal.`,
        );
      }

      definitionSources.push({ exportName: declaration.name.text, filePath });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return definitionSources;
}
