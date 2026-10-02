import { createRequire } from "node:module";
import path from "node:path";

import { build } from "esbuild";

import {
  ACTION_DEFINITIONS,
  type DefinitionKind,
  type DefinitionSource,
  QUERY_DEFINITIONS,
  findDefinitionSources,
} from "./ast/definition-source";
import { canonicalJson } from "./canonical";
import { isEntityId } from "./entity-ids";
import { isPositiveInteger, isRecord } from "./guards";
import { getRelativeDefinitionLocation } from "./messages";
import type { DiscoveredAction, DiscoveredQuery } from "./types";

interface EvaluatedDefinition extends DefinitionSource {
  value: Record<string, unknown>;
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

function definedEntityId(value: unknown, location: string, idKey: string) {
  if (value === undefined) {
    return undefined;
  }

  if (!isEntityId(value)) {
    throw new Error(`${location} has an invalid ${idKey}.`);
  }

  return value;
}

/**
 * Evaluates every definition of `kind`, proving each one is deterministic so the
 * resource written from it keeps describing it.
 */
async function evaluateDefinitions(
  appRoot: string,
  kind: DefinitionKind,
): Promise<EvaluatedDefinition[]> {
  const sourcesByFile = new Map<string, DefinitionSource[]>();

  for (const source of findDefinitionSources(appRoot, kind)) {
    sourcesByFile.set(source.filePath, [
      ...(sourcesByFile.get(source.filePath) ?? []),
      source,
    ]);
  }

  const evaluated: EvaluatedDefinition[] = [];

  for (const [filePath, fileSources] of sourcesByFile) {
    const [first, second] = await Promise.all([
      evaluateModule(filePath),
      evaluateModule(filePath),
    ]);

    for (const { exportName } of fileSources) {
      const value = first[exportName];
      const repeatedValue = second[exportName];

      const location = getRelativeDefinitionLocation(appRoot, {
        filePath,
        exportName,
      });

      if (!isRecord(value)) {
        throw new Error(
          `${location} did not evaluate to ${kind.description} object.`,
        );
      }

      let deterministic: boolean;
      try {
        deterministic = canonicalJson(value) === canonicalJson(repeatedValue);
      } catch (error) {
        throw new Error(
          `${location} could not be canonicalized: ${String(error)}`,
        );
      }

      if (!deterministic) {
        throw new Error(`${location} is not deterministic.`);
      }

      evaluated.push({ exportName, filePath, value });
    }
  }

  return evaluated;
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
): Promise<DiscoveredQuery[]> {
  const definitions = await evaluateDefinitions(appRoot, QUERY_DEFINITIONS);

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

export async function discoverActions(
  appRoot: string,
): Promise<DiscoveredAction[]> {
  const definitions = await evaluateDefinitions(appRoot, ACTION_DEFINITIONS);

  const discovered = definitions.map(({ exportName, filePath, value }) => {
    const location = getRelativeDefinitionLocation(appRoot, {
      filePath,
      exportName,
    });
    const action = value.action;

    if (!isRecord(action) || !isPositiveInteger(action.id)) {
      throw new Error(
        `${location} must reference a generated action, such as \`schema.models.<model>.actions.<action>\`.`,
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
