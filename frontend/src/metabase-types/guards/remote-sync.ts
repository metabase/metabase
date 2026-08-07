import {
  type RemoteSyncDependencyErrorResponse,
  UNSYNCED_DEPENDENCIES_ERROR_CODE,
} from "metabase-types/api";

import { isObject } from "./common";

/**
 * Narrows a rejected `updateRemoteSyncSettings` request to the dependency failure the backend
 * returns when the requested collections reference content that would stay unsynced. Any other
 * failure (bad credentials, read-only mode, …) comes back without this payload.
 */
export const isRemoteSyncDependencyError = (
  error: unknown,
): error is { data: RemoteSyncDependencyErrorResponse } =>
  isObject(error) &&
  isObject(error.data) &&
  error.data.error_code === UNSYNCED_DEPENDENCIES_ERROR_CODE;
