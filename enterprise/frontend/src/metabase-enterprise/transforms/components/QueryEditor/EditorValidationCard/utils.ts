import type { QueryErrorType } from "../types";

export function getErrorAcknowledgementKey(errorType: QueryErrorType) {
  return `transforms-error-${errorType}`;
}
