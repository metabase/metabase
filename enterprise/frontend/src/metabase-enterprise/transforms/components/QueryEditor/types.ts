export type QueryErrorType = "variable";

export type QueryValidationResult = {
  isValid: boolean;
  errorType?: QueryErrorType;
  errorMessage?: string;
};
