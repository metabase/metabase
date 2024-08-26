import type { VALIDATION_ERROR_TYPES } from "./constants";

export type ErrorType =
  typeof VALIDATION_ERROR_TYPES[keyof typeof VALIDATION_ERROR_TYPES];
