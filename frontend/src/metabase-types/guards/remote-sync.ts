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

/**
 * True for any rejected request carrying a structured `errors` payload. The backend uses that key for
 * several remote-sync failures — unsynced dependencies, remote-synced dependents — and the form layer
 * would adopt any of them as field-level validation errors, so they all have to be stripped before the
 * rejection reaches it.
 */
export const hasRemoteSyncErrorsPayload = (
  error: unknown,
): error is { data: { errors: unknown } } =>
  isObject(error) && isObject(error.data) && isObject(error.data.errors);
