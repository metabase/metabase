import { t } from "ttag";

export function validateCacheTTL(value) {
  if (value === null) {
    return;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    return t`Must be a positive integer value`;
  }
}
