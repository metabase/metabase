import { createRequire } from "node:module";
import path from "node:path";

import { build } from "esbuild";

import { type QuerySource, findQuerySources } from "./ast/query-source";
import { canonicalJson, getQueryFingerprint } from "./canonical";
import type { DiscoveredQuery } from "./types";

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
  const sources = findQuerySources(appRoot);

  const queryByFile = new Map<string, QuerySource[]>();

  for (const source of sources) {
    queryByFile.set(source.filePath, [
      ...(queryByFile.get(source.filePath) ?? []),
      source,
    ]);
  }

  const discovered: DiscoveredQuery[] = [];

  for (const [filePath, fileSources] of queryByFile) {
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

  const queryById = new Map<number, DiscoveredQuery[]>();

  for (const query of discovered) {
    if (query.savedQuestionSourceId) {
      queryById.set(query.savedQuestionSourceId, [
        ...(queryById.get(query.savedQuestionSourceId) ?? []),
        query,
      ]);
    }
  }

  for (const [id, conflicts] of queryById) {
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
