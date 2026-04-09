import { t } from "ttag";

import type { GenericErrorResponse } from "metabase/lib/errors";

export const getUpdateApiErrorMessage = (
  error: GenericErrorResponse | unknown,
): string => {
  const maybeError = error as GenericErrorResponse;

  if (typeof maybeError.data === "string") {
    return maybeError.data;
  }

  if (
    Array.isArray(maybeError.data?.errors) &&
    maybeError.data.errors[0] &&
    ("message" in maybeError.data.errors[0] ||
      "error" in maybeError.data.errors[0])
  ) {
    return maybeError.data.errors[0].message ?? maybeError.data.errors[0].error;
  }

  if (
    Array.isArray(maybeError.errors) &&
    ("message" in maybeError.errors[0] || "error" in maybeError.errors[0])
  ) {
    return maybeError.errors[0].message ?? maybeError.errors[0].error;
  }

  if (typeof maybeError.data?.message === "string") {
    return maybeError.data.message;
  }

  return t`Unknown error`;
};

export function getUpdateApiErrorType(error: unknown): string {
  if (
    isRecord(error) &&
    isRecord(error.data) &&
    isRecord(error.data.data) &&
    typeof error.data.data.type === "string"
  ) {
    return error.data.data.type;
  }

  return "";
}

export function getUpdateApiTableId(error: unknown): number | undefined {
  if (
    isRecord(error) &&
    isRecord(error.data) &&
    isRecord(error.data.data) &&
    typeof error.data.data["table-id"] === "number"
  ) {
    return error.data.data["table-id"];
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
