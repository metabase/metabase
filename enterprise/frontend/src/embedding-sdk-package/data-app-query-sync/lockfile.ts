import fs from "node:fs";
import path from "node:path";

import { isPositiveInteger, isRecord } from "./guards";
import type {
  ActionLockEntry,
  MetricLockEntry,
  ModelLockEntry,
  QueryLockEntry,
  ResourceLockfile,
} from "./types";

export const RESOURCE_LOCKFILE = "resources_metadata.json";

const HASH_PATTERN = /^v1:sha256:[0-9a-f]{64}$/;

function isHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function isQueryLockEntry(value: unknown): value is QueryLockEntry {
  return (
    isRecord(value) &&
    isPositiveInteger(value.tableId) &&
    isPositiveInteger(value.savedQuestionSourceId) &&
    isHash(value.hash)
  );
}

function isActionLockEntry(value: unknown): value is ActionLockEntry {
  return (
    isRecord(value) &&
    isPositiveInteger(value.sourceActionId) &&
    isPositiveInteger(value.copiedActionId) &&
    isHash(value.hash)
  );
}

function isModelLockEntry(value: unknown): value is ModelLockEntry {
  return (
    isRecord(value) &&
    isPositiveInteger(value.sourceModelId) &&
    isPositiveInteger(value.copiedModelId) &&
    isHash(value.hash) &&
    Array.isArray(value.actions) &&
    value.actions.every(isActionLockEntry)
  );
}

function isMetricLockEntry(value: unknown): value is MetricLockEntry {
  return (
    isRecord(value) &&
    isPositiveInteger(value.sourceMetricId) &&
    isPositiveInteger(value.copiedMetricId) &&
    isHash(value.hash)
  );
}

function parseMetrics(value: unknown): MetricLockEntry[] {
  if (value === undefined) {
    return [];
  }

  if (
    !Array.isArray(value) ||
    value.some((entry) => !isMetricLockEntry(entry))
  ) {
    throw new Error(`${RESOURCE_LOCKFILE} contains an invalid metric entry.`);
  }

  assertUnique(
    value.map((entry) => entry.sourceMetricId),
    "source metric ID",
  );

  assertUnique(
    value.map((entry) => entry.copiedMetricId),
    "copied metric ID",
  );

  return value;
}

function assertUnique(ids: number[], subject: string) {
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${RESOURCE_LOCKFILE} contains a duplicate ${subject}.`);
  }
}

function parseQueries(value: unknown): QueryLockEntry[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => !isQueryLockEntry(entry))
  ) {
    throw new Error(`${RESOURCE_LOCKFILE} contains an invalid entry.`);
  }

  const queries: QueryLockEntry[] = value;

  assertUnique(
    queries.map((entry) => entry.savedQuestionSourceId),
    "saved question ID",
  );

  return queries;
}

function parseModels(value: unknown): ModelLockEntry[] {
  if (value === undefined) {
    return [];
  }

  if (
    !Array.isArray(value) ||
    value.some((entry) => !isModelLockEntry(entry))
  ) {
    throw new Error(`${RESOURCE_LOCKFILE} contains an invalid model entry.`);
  }

  const models: ModelLockEntry[] = value;

  assertUnique(
    models.map((entry) => entry.sourceModelId),
    "source model ID",
  );
  assertUnique(
    models.map((entry) => entry.copiedModelId),
    "copied model ID",
  );
  assertUnique(
    models.flatMap((entry) =>
      entry.actions.map(({ sourceActionId }) => sourceActionId),
    ),
    "source action ID",
  );
  assertUnique(
    models.flatMap((entry) =>
      entry.actions.map(({ copiedActionId }) => copiedActionId),
    ),
    "copied action ID",
  );

  return models;
}

export function readResourceLockfile(appRoot: string): ResourceLockfile {
  const lockfilePath = path.join(appRoot, RESOURCE_LOCKFILE);

  if (!fs.existsSync(lockfilePath)) {
    return { queries: [], models: [], metrics: [] };
  }

  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(lockfilePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${RESOURCE_LOCKFILE}: ${String(error)}`);
  }

  if (!isRecord(value)) {
    throw new Error(`${RESOURCE_LOCKFILE} contains an invalid entry.`);
  }

  if (
    value.collectionId !== undefined &&
    !isPositiveInteger(value.collectionId)
  ) {
    throw new Error(`${RESOURCE_LOCKFILE} contains an invalid collection ID.`);
  }

  return {
    ...(value.collectionId === undefined
      ? undefined
      : { collectionId: value.collectionId }),
    queries: parseQueries(value.queries ?? []),
    models: parseModels(value.models),
    metrics: parseMetrics(value.metrics),
  };
}

export function writeResourceLockfile(
  appRoot: string,
  lockfile: ResourceLockfile,
) {
  fs.writeFileSync(
    path.join(appRoot, RESOURCE_LOCKFILE),
    `${JSON.stringify(lockfile, null, 2)}\n`,
  );
}
