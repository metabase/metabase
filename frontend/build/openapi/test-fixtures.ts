import fs from "fs";
import os from "os";
import path from "path";

import ts from "typescript";

/**
 * The request shape RTK hands to `baseQuery` (frontend/src/metabase/api/api.ts:59-65).
 * `defineEndpoint` and `EndpointBuilder` type a fixture's query function the way RTK's builder does,
 * so a fixture cannot build a request a real endpoint cannot.
 */
export const BASE_QUERY_ARGS = `type BaseQueryArgs = string | { method?: "GET" | "POST" | "PUT" | "DELETE"; url: string | null; params?: Record<string, unknown> | null | void; body?: unknown };`;

export const ENDPOINT_PRELUDE = `${BASE_QUERY_ARGS}
  function defineEndpoint<Argument>(endpoint: {
    query: (argument: Argument) => BaseQueryArgs;
    extraOptions?: unknown;
  }) {
    return endpoint;
  }
`;

export const ENDPOINT_BUILDER = `${BASE_QUERY_ARGS}
    type EndpointBuilder = {
      query<Response, Request>(config: {
        query?: (request: Request) => BaseQueryArgs;
        queryFn?: () => unknown;
        transformResponse?: (response: unknown) => Response;
      }): unknown;
    };
    declare const builder: EndpointBuilder;`;

const directories: string[] = [];

/** Removes the temporary directories the fixtures were written to; call it from `afterEach`. */
export function cleanupFixtures(): void {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

export interface FixtureProgram {
  root: string;
  files: Record<string, string>;
  program: ts.Program;
  checker: ts.TypeChecker;
}

export const COMPILER_OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ESNext,
  lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
};

/**
 * Writes the fixture files to a temporary directory and compiles them.
 * Semantic errors in `checked` files fail the fixture, except an unresolved name (TS2304),
 * which a fixture may leave on purpose.
 */
export function programFrom(
  sources: Record<string, string>,
  {
    options = {},
    checked = Object.keys(sources),
  }: { options?: ts.CompilerOptions; checked?: string[] } = {},
): FixtureProgram {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "api-contracts-"));
  directories.push(root);
  const files = Object.fromEntries(
    Object.entries(sources).map(([name, contents]) => {
      const file = path.join(root, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
      return [name, file];
    }),
  );
  const program = ts.createProgram(Object.values(files), {
    ...COMPILER_OPTIONS,
    ...options,
  });
  for (const name of checked) {
    const file = files[name];
    const source = file && program.getSourceFile(file);
    if (!source) {
      throw new Error(`The fixture ${name} was not compiled.`);
    }
    const diagnostics = program
      .getSemanticDiagnostics(source)
      .filter((diagnostic) => diagnostic.code !== 2304);
    if (diagnostics.length) {
      throw new Error(
        diagnostics
          .map((diagnostic) =>
            ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
          )
          .join("\n"),
      );
    }
  }
  return { root, files, program, checker: program.getTypeChecker() };
}

/** The object literal of `const endpoint = defineEndpoint({ ... })` in a compiled fixture. */
export function endpointObject(
  program: ts.Program,
  file: string,
): ts.ObjectLiteralExpression {
  const source = program.getSourceFile(file);
  let found: ts.ObjectLiteralExpression | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "endpoint" &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.arguments[0] &&
      ts.isObjectLiteralExpression(node.initializer.arguments[0])
    ) {
      found = node.initializer.arguments[0];
    }
    ts.forEachChild(node, visit);
  };
  if (source) {
    visit(source);
  }
  if (!found) {
    throw new Error(
      "The fixture needs a `const endpoint = defineEndpoint({ ... })` object.",
    );
  }
  return found;
}
