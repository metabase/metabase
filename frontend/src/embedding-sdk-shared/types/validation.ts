export type SchemaValidationErrorCode =
  | "missing_required_property"
  | "unrecognized_keys";

export type SchemaValidationErrorMetadata = {
  errorCode: SchemaValidationErrorCode;
  data: string;
};

export type FunctionParametersSchemaValidationErrorMetadata =
  SchemaValidationErrorMetadata & {
    parameterIndex: number;
  };

export type FunctionSchemaValidationResult<
  TParameters extends unknown[],
  TReturnValue,
> = {
  validateParameters: (parameters: TParameters) => {
    success: boolean;
    errorMetadata?: FunctionParametersSchemaValidationErrorMetadata;
  };
  validateReturnValue: (returnValue: TReturnValue) => {
    success: boolean;
    errorMetadata?: SchemaValidationErrorMetadata;
  };
};
