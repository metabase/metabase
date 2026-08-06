import fs from "node:fs";
import path from "node:path";

import type { QueryLockEntry } from "./types";

export const QUERY_LOCKFILE = "queries_metadata.json";

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isQueryLockEntry(value: unknown): value is QueryLockEntry {
  return (
    !!value &&
    typeof value === "object" &&
    "tableId" in value &&
    isPositiveInteger(value.tableId) &&
    "savedQuestionSourceId" in value &&
    isPositiveInteger(value.savedQuestionSourceId) &&
    "hash" in value &&
    typeof value.hash === "string" &&
    /^v1:sha256:[0-9a-f]{64}$/.test(value.hash)
  );
}

export function readQueryLockfile(appRoot: string): QueryLockEntry[] {
  const lockfilePath = path.join(appRoot, QUERY_LOCKFILE);
  if (!fs.existsSync(lockfilePath)) {
    return [];
  }

  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(lockfilePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read ${QUERY_LOCKFILE}: ${String(error)}`);
  }

  if (
    !Array.isArray(value) ||
    value.some((entry) => !isQueryLockEntry(entry))
  ) {
    throw new Error(`${QUERY_LOCKFILE} contains an invalid entry.`);
  }

  const ids = value.map((entry) => entry.savedQuestionSourceId);
  if (new Set(ids).size !== ids.length) {
    throw new Error(
      `${QUERY_LOCKFILE} contains a duplicate saved question ID.`,
    );
  }

  return value;
}

export function writeQueryLockfile(appRoot: string, entries: QueryLockEntry[]) {
  fs.writeFileSync(
    path.join(appRoot, QUERY_LOCKFILE),
    `${JSON.stringify(entries, null, 2)}\n`,
  );
}
