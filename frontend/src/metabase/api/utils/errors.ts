import { t } from "ttag";

import { isObject } from "metabase-types/guards/common";

export type ErrorPayload =
  | { message: string }
  | { error: string }
  | { error_message: string }
  | string;

/**
 * The human-readable message in an API error, whatever shape it arrived in, or `undefined` when it has none.
 *
 * An error body is either the message itself or an object carrying it under `message`, `error`, `error_message` or
 * `cause`, with validation failures under `errors`. RTK Query results and thrown responses wrap the body under
 * `data`, and a nested `error` may itself be such a wrapper. The lookup recurses through all of these, so callers
 * don't depend on the exact shape of a response. A structured body is the most specific source and wins over the
 * error's own message; a plain-string body is the last resort.
 */
export const findErrorMessage = (payload: unknown): string | undefined => {
  if (typeof payload === "string") {
    return payload || undefined;
  }

  if (!isObject(payload)) {
    return undefined;
  }

  const body = isObject(payload.data) ? payload.data : undefined;
  const stringBody =
    typeof payload.data === "string" ? payload.data : undefined;

  return (
    findErrorMessage(body) ??
    findErrorMessage(payload.message) ??
    findErrorMessage(payload.error) ??
    findErrorMessage(payload.error_message) ??
    findErrorMessage(payload.cause) ??
    findValidationMessage(payload.errors) ??
    findErrorMessage(stringBody)
  );
};

/**
 * Validation failures arrive as a map from field name to message, with a whole-form message under `_error`, or as
 * a list of error objects. Field messages are fragments meant for the field they belong to, so only the whole-form
 * ones count as the error's message.
 */
const findValidationMessage = (errors: unknown): string | undefined => {
  if (Array.isArray(errors)) {
    for (const error of errors) {
      const message = findErrorMessage(error);
      if (message !== undefined) {
        return message;
      }
    }
    return undefined;
  }

  return isObject(errors) ? findErrorMessage(errors._error) : undefined;
};

/** [[findErrorMessage]] with `fallback` when the error has no message. */
export const getErrorMessage = (
  payload: unknown,
  fallback: string = t`Something went wrong`,
): string => findErrorMessage(payload) ?? fallback;

type RequestError = {
  status?: number;
  data?: { error_code?: string; errors?: Record<string, unknown> };
};

const isRequestError = (error: unknown): error is RequestError =>
  typeof error === "object" && error !== null;

// The createUser endpoint rejects a duplicate email with a 400 carrying an
// `error_code`. Prefer the stable code over the localized field message.
export const isEmailAlreadyInUse = (error: unknown): boolean =>
  isRequestError(error) && error.data?.error_code === "email-already-in-use";
