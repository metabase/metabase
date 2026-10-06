import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { build } from "esbuild";

import { isEntityId, isObject } from "./guards";
import type { DiscoveredAction, DiscoveredQuery } from "./types";

/** A source-controlled definition kind, and where the CLI looks for it. */
interface DefinitionKind {
  directory: string;
  idKey: string;
}

export const QUERY_DEFINITIONS: DefinitionKind = {
  directory: "queries",
  idKey: "savedQuestionEntityId",
};

export const ACTION_DEFINITIONS: DefinitionKind = {
  directory: "actions",
  idKey: "copiedActionEntityId",
};

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

/** Where a definition is, as messages name it: `queries/orders.query.ts:Orders`. */
export function getRelativeDefinitionLocation(
  appRoot: string,
  { filePath, exportName }: { filePath: string; exportName: string },
) {
  return `${path.relative(appRoot, filePath)}:${exportName}`;
}

interface EvaluatedDefinition {
  exportName: string;
  filePath: string;
  value: Record<string, unknown>;
}

function listDefinitionFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((relativePath) =>
      DEFINITION_FILE_EXTENSIONS.some((extension) =>
        relativePath.endsWith(extension),
      ),
    )
    .map((relativePath) => path.join(directory, relativePath))
    .sort();
}

/**
 * Bundles every definition file into one module and evaluates it, so a file
 * two others import is instantiated once and its definitions keep their
 * identity across them.
 */
async function evaluateFiles(directory: string, filePaths: string[]) {
  const result = await build({
    stdin: {
      contents: filePaths
        .map(
          (filePath, index) =>
            `export * as file${index} from ${JSON.stringify(filePath)};`,
        )
        .join("\n"),
      resolveDir: directory,
      loader: "ts",
    },
    absWorkingDir: directory,
    bundle: true,
    format: "cjs",
    packages: "external",
    platform: "node",
    target: "node22",
    write: false,
    logLevel: "silent",
  });

  const compiled = result.outputFiles[0]?.text;

  if (!compiled) {
    throw new Error(`Could not evaluate the definitions in ${directory}.`);
  }

  const runtimeModule: { exports: Record<string, unknown> } = { exports: {} };

  new Function("require", "module", "exports", compiled)(
    createRequire(path.join(directory, "definitions.ts")),
    runtimeModule,
    runtimeModule.exports,
  );

  return filePaths.map((filePath, index) => ({
    filePath,
    exports: runtimeModule.exports[`file${index}`],
  }));
}

/** Narrows discovery to one definition file, the one `print-resources <file>` is asked about. */
export interface DiscoveryOptions {
  filePath?: string;
}

/**
 * Every object a definition file exports is a definition: `defineQuery` and
 * `defineAction` return their argument as is, and the directories hold nothing
 * else. An object re-exported by a second file counts once, for the first file
 * that exports it; asking for one file reads that file's exports alone, so a
 * barrel that re-exports its definitions doesn't claim them.
 */
async function evaluateDefinitions(
  appRoot: string,
  kind: DefinitionKind,
  { filePath: requestedFilePath }: DiscoveryOptions,
): Promise<EvaluatedDefinition[]> {
  const directory = path.join(appRoot, kind.directory);
  const filePaths = listDefinitionFiles(directory);

  if (filePaths.length === 0) {
    return [];
  }

  const seen = new Set<object>();
  const evaluated: EvaluatedDefinition[] = [];

  for (const { filePath, exports } of await evaluateFiles(
    directory,
    filePaths,
  )) {
    if (requestedFilePath !== undefined && filePath !== requestedFilePath) {
      continue;
    }

    for (const [exportName, value] of Object.entries(
      isObject(exports) ? exports : {},
    )) {
      if (isObject(value) && !seen.has(value)) {
        seen.add(value);
        evaluated.push({ exportName, filePath, value });
      }
    }
  }

  return evaluated;
}

function definedEntityId(value: unknown, location: string, idKey: string) {
  if (value === undefined) {
    return undefined;
  }

  if (!isEntityId(value)) {
    throw new Error(`${location} has an invalid ${idKey}.`);
  }

  return value;
}

/** Rejects two definitions claiming the same ID, as a copied definition would. */
function assertUniqueIds(
  entries: Array<{ id: number | string | undefined; location: string }>,
  subject: string,
  fix: string,
) {
  const byId = new Map<number | string, string[]>();

  for (const { id, location } of entries) {
    if (id !== undefined) {
      byId.set(id, [...(byId.get(id) ?? []), location]);
    }
  }

  for (const [id, locations] of byId) {
    if (locations.length > 1) {
      throw new Error(
        `${subject} ${id} is referenced by ${locations.join(", ")}. ${fix}`,
      );
    }
  }
}

export async function discoverQueries(
  appRoot: string,
  options: DiscoveryOptions = {},
): Promise<DiscoveredQuery[]> {
  const definitions = await evaluateDefinitions(
    appRoot,
    QUERY_DEFINITIONS,
    options,
  );

  const discovered = definitions.map(({ exportName, filePath, value }) => ({
    exportName,
    filePath,
    query: value,
    savedQuestionEntityId: definedEntityId(
      value[QUERY_DEFINITIONS.idKey],
      getRelativeDefinitionLocation(appRoot, { filePath, exportName }),
      QUERY_DEFINITIONS.idKey,
    ),
  }));

  assertUniqueIds(
    discovered.map((query) => ({
      id: query.savedQuestionEntityId,
      location: getRelativeDefinitionLocation(appRoot, query),
    })),
    "Saved question",
    "Give each definition its own saved question.",
  );

  return discovered;
}

const isGeneratedActionId = (id: unknown): id is number =>
  typeof id === "number" && Number.isInteger(id) && id > 0;

export async function discoverActions(
  appRoot: string,
  options: DiscoveryOptions = {},
): Promise<DiscoveredAction[]> {
  const definitions = await evaluateDefinitions(
    appRoot,
    ACTION_DEFINITIONS,
    options,
  );

  const discovered = definitions.map(({ exportName, filePath, value }) => {
    const location = getRelativeDefinitionLocation(appRoot, {
      filePath,
      exportName,
    });
    const action = value.action;

    if (!isObject(action) || !isGeneratedActionId(action.id)) {
      throw new Error(
        `${location} must reference a generated action, such as \`schema.actions.<action>\`.`,
      );
    }

    return {
      exportName,
      filePath,
      copiedActionEntityId: definedEntityId(
        value[ACTION_DEFINITIONS.idKey],
        location,
        ACTION_DEFINITIONS.idKey,
      ),
      sourceActionId: action.id,
    };
  });

  assertUniqueIds(
    discovered.map((action) => ({
      id: action.sourceActionId,
      location: getRelativeDefinitionLocation(appRoot, action),
    })),
    "Action",
    "Declare each action once.",
  );
  assertUniqueIds(
    discovered.map((action) => ({
      id: action.copiedActionEntityId,
      location: getRelativeDefinitionLocation(appRoot, action),
    })),
    "Copied action",
    "Give each definition its own copy.",
  );

  return discovered;
}
