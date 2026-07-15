import { t } from "ttag";

export type ErrorPayload =
  | { message: string }
  | { error: string }
  | { error_message: string }
  | string;

export const getErrorMessage = (
  payload:
    | unknown
    | ErrorPayload
    | { data: ErrorPayload }
    | { error: ErrorPayload },
  fallback: string = t`Something went wrong`,
): string => {
  if (typeof payload === "string") {
    return payload || fallback;
  }

  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  if ("message" in payload && !isEmpty(payload.message)) {
    return getErrorMessage(payload.message, fallback);
  }

  if ("error" in payload && !isEmpty(payload.error)) {
    return getErrorMessage(payload.error, fallback);
  }

  if ("error_message" in payload && !isEmpty(payload.error_message)) {
    return getErrorMessage(payload.error_message, fallback);
  }

  if ("data" in payload && !isEmpty(payload.data)) {
    return getErrorMessage(payload.data, fallback);
  }

  return fallback;
};

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

function isEmpty(value: unknown): boolean {
  return value == null || value === "";
}
