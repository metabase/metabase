export const VALIDATION_ERROR_TYPES = {
  MISSING_TAG_DIMENSION: "MISSING_TAG_DIMENSION",
} as const;

type ErrorType = typeof VALIDATION_ERROR_TYPES[keyof typeof VALIDATION_ERROR_TYPES];

export class ValidationError extends Error {
  type: ErrorType;

  constructor(message: string, errorType: ErrorType) {
    super(message);
    this.type = errorType;
  }
}
