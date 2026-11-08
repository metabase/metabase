import type { RemoteSyncUnsyncedDependenciesError } from "metabase-types/api";

import { isObject } from "./common";

export const isRemoteSyncUnsyncedDependenciesError = (
  error: unknown,
): error is RemoteSyncUnsyncedDependenciesError =>
  isObject(error) &&
  isObject(error.data) &&
  error.data["error-code"] === "unsynced-dependencies";
