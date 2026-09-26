/* eslint-disable no-console -- CLI diagnostics */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";

import { type GeneratedOperation, operationsDeclarations } from "./operations";
import {
  GENERATED_DECLARATIONS_PATH,
  GENERATED_OPERATIONS_PATH,
  OPENAPI_SPEC_PATH,
} from "./paths";

const HTTP_METHODS = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
];

const root = process.cwd();

interface SpecOperation {
  method: string;
  path: string;
  operationId: string;
  label: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function specOperations(spec: unknown): SpecOperation[] {
  if (!isRecord(spec) || !isRecord(spec.paths)) {
    throw new Error(`${OPENAPI_SPEC_PATH} has no paths object.`);
  }
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.entries(isRecord(item) ? item : {})
      .filter(([method]) => HTTP_METHODS.includes(method))
      .map(([method, operation]) => {
        const route = `${method.toUpperCase()} ${path}`;
        const operationId = isRecord(operation)
          ? operation.operationId
          : undefined;
        if (typeof operationId !== "string") {
          throw new Error(
            `${route} has no operationId in ${OPENAPI_SPEC_PATH}.`,
          );
        }
        return {
          method,
          path,
          operationId,
          label: `${route} (operationId ${operationId})`,
        };
      }),
  );
}

// openapi-ts names an operation's types after its operationId in PascalCase,
// with a Data or Responses suffix.
// Its conversion turns get-api-tiles-zoom-x-y into GetApiTilesZoomXy,
// so names are compared without case or punctuation.
function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function urlOf(alias: ts.TypeAliasDeclaration | undefined): string | undefined {
  const url =
    alias &&
    ts.isTypeLiteralNode(alias.type) &&
    alias.type.members.find(
      (member) =>
        member.name &&
        ts.isIdentifier(member.name) &&
        member.name.text === "url",
    );
  return url &&
    ts.isPropertySignature(url) &&
    url.type &&
    ts.isLiteralTypeNode(url.type) &&
    ts.isStringLiteral(url.type.literal)
    ? url.type.literal.text
    : undefined;
}

function operationTypes(
  operations: SpecOperation[],
  declarations: ts.SourceFile,
): GeneratedOperation[] {
  const aliases = new Map(
    declarations.statements
      .filter(ts.isTypeAliasDeclaration)
      .map((alias) => [alias.name.text, alias]),
  );
  const requestTypes = new Map<string, string[]>();
  for (const name of aliases.keys()) {
    if (name.endsWith("Data")) {
      const key = nameKey(name.slice(0, -"Data".length));
      requestTypes.set(key, [...(requestTypes.get(key) ?? []), name]);
    }
  }
  const matched = new Map<string, string>();
  return operations.map(({ method, path, operationId, label }) => {
    const names = requestTypes.get(nameKey(operationId)) ?? [];
    const [data, ...others] = names;
    if (!data || others.length) {
      throw new Error(
        `${label} matches ${names.length ? names.join(" and ") : "no request type"} in ${GENERATED_DECLARATIONS_PATH}.`,
      );
    }
    const previous = matched.get(data);
    if (previous) {
      throw new Error(
        `${previous} and ${label} both match the request type ${data}.`,
      );
    }
    matched.set(data, label);
    const url = urlOf(aliases.get(data));
    if (url !== path) {
      throw new Error(
        `${label} matches the request type ${data}, whose url is ${url ?? "missing"}.`,
      );
    }
    const responses = `${data.slice(0, -"Data".length)}Responses`;
    return {
      method,
      path,
      data,
      responses: aliases.has(responses) ? responses : undefined,
    };
  });
}

function main(): void {
  const spec: unknown = JSON.parse(
    readFileSync(resolve(root, OPENAPI_SPEC_PATH), "utf8"),
  );
  const declarationsPath = resolve(root, GENERATED_DECLARATIONS_PATH);
  const declarations = ts.createSourceFile(
    declarationsPath,
    readFileSync(declarationsPath, "utf8"),
    ts.ScriptTarget.Latest,
  );
  const operations = operationTypes(specOperations(spec), declarations);
  writeFileSync(
    resolve(root, GENERATED_OPERATIONS_PATH),
    operationsDeclarations(operations),
  );
  console.log(
    `Generated ${operations.length} operations in ${GENERATED_OPERATIONS_PATH}`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
