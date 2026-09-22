import { createRequire } from "node:module";
import path from "node:path";

import { build } from "esbuild";

import {
  ACTION_DEFINITIONS,
  type DefinitionKind,
  QUERY_DEFINITIONS,
  type QuerySource,
  findDefinitionSources,
} from "./ast/query-source";
import { canonicalJson, getQueryFingerprint } from "./canonical";
import { isPositiveInteger, isRecord } from "./guards";
import { getRelativeDefinitionLocation } from "./messages";
import type { DiscoveredAction, DiscoveredQuery } from "./types";

interface EvaluatedDefinition extends QuerySource {
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

function positiveId(value: unknown, location: string, idKey: string) {
  if (value === undefined) {
    return undefined;
  }

  if (!isPositiveInteger(value)) {
    throw new Error(`${location} has an invalid ${idKey}.`);
  }

  return value;
}

/**
 * Evaluates every definition of `kind`, proving each one is deterministic so a
 * generated ID always describes the same authored value.
 */
async function evaluateDefinitions(
  appRoot: string,
  kind: DefinitionKind,
): Promise<EvaluatedDefinition[]> {
  const sourcesByFile = new Map<string, QuerySource[]>();

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

/**
 * Rejects two definitions claiming the same ID, which would otherwise let one
 * copied definition silently take ownership of another's Metabase entity.
 */
function assertUniqueIds(
  entries: Array<{ id: number | undefined; location: string }>,
  subject: string,
) {
  const byId = new Map<number, string[]>();

  for (const { id, location } of entries) {
    if (id) {
      byId.set(id, [...(byId.get(id) ?? []), location]);
    }
  }

  for (const [id, locations] of byId) {
    if (locations.length > 1) {
      throw new Error(
        `${subject} ${id} is referenced by ${locations.join(", ")}. Remove the ID from the copied definition and sync again.`,
      );
    }
  }
}

export async function discoverQueries(
  appRoot: string,
): Promise<DiscoveredQuery[]> {
  const definitions = await evaluateDefinitions(appRoot, QUERY_DEFINITIONS);

  const discovered = definitions.map(({ exportName, filePath, value }) => {
    const { tableId, hash } = getQueryFingerprint(value);

    return {
      exportName,
      filePath,
      query: value,
      savedQuestionSourceId: positiveId(
        value[QUERY_DEFINITIONS.idKey],
        getRelativeDefinitionLocation(appRoot, { filePath, exportName }),
        QUERY_DEFINITIONS.idKey,
      ),
      tableId,
      hash,
    };
  });

  assertUniqueIds(
    discovered.map((query) => ({
      id: query.savedQuestionSourceId,
      location: getRelativeDefinitionLocation(appRoot, query),
    })),
    "Saved question",
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
      copiedActionId: positiveId(
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
  );
  assertUniqueIds(
    discovered.map((action) => ({
      id: action.copiedActionId,
      location: getRelativeDefinitionLocation(appRoot, action),
    })),
    "Generated action",
  );

  return discovered;
}
