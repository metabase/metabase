import { isObject } from "metabase-types/guards/common";

/**
 * The database form shows connection errors under `details`, so API field
 * errors are nested there. Errors without an object `data` body (network
 * failures, plain-text responses) are passed through unchanged, so their own
 * message can still be shown.
 */
export const getSubmitError = (error: unknown): unknown => {
  if (!isObject(error) || !isObject(error.data)) {
    return error;
  }
  return {
    ...error,
    data: { ...error.data, errors: { details: error.data.errors } },
  };
};
