import type { RemoteSyncEntityModel } from "metabase-types/api";

export const TASK_POLLING_INTERVAL_MS = 1000;

export const TRANSFORM_MODELS: ReadonlySet<RemoteSyncEntityModel> = new Set([
  "transform",
  "transformtag",
  "transformtest",
  "pythonlibrary",
]);

export const TABLE_MODELS: ReadonlySet<RemoteSyncEntityModel> = new Set([
  "tableusersettings",
  "fieldusersettings",
  "segment",
  "measure",
]);
