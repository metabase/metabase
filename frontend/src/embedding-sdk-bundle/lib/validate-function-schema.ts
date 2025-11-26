import type * as Yup from "yup";

import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";
import type {
  FunctionParametersSchemaValidationErrorMetadata,
  FunctionSchemaValidationResult,
  SchemaValidationErrorMetadata,
} from "embedding-sdk-shared/types/validation";

const getErrorMetadata = <
  TMetadata extends
    | SchemaValidationErrorMetadata
    | FunctionParametersSchemaValidationErrorMetadata,
>({
  error,
  parameterIndex,
}: {
  error: Yup.ValidationError;
  parameterIndex?: number;
}): TMetadata | null => {
  switch (error.type) {
    case "required":
      return {
        errorCode: "missing_required_property",
        data: error.params?.path ?? "",
        parameterIndex,
      } as TMetadata;
    case "noUnknown":
      return {
        errorCode: "unrecognized_keys",
        data: error.params?.unknown ?? "",
        parameterIndex,
      } as TMetadata;
  }

  return null;
};

export const validateFunctionSchema = <
  TSchema extends FunctionSchema,
  TParameters extends unknown[],
  TReturnValue,
>(
  schema: TSchema,
): FunctionSchemaValidationResult<TParameters, TReturnValue> => {
  const parameterSchemas = schema.input;
  const returnValueSchema = schema.output;

  const validateParameters = (parameters: TParameters) => {
    for (let i = 0; i < parameterSchemas.length; i++) {
      const parameter = parameters[i];
      const parameterSchema = parameterSchemas[i];

      try {
        parameterSchema.validateSync(parameter, {
          strict: true,
        });

        return { success: true };
      } catch (_error: unknown) {
        const error = _error as Yup.ValidationError;
        const errorMetadata =
          getErrorMetadata<FunctionParametersSchemaValidationErrorMetadata>({
            error,
            parameterIndex: i,
          });

        if (errorMetadata) {
          return {
            success: false,
            errorMetadata,
          };
        }
      }
    }

    return { success: true };
  };
  const validateReturnValue = (returnValue: TReturnValue) => {
    if (!returnValueSchema) {
      return { success: true };
    }

    try {
      returnValueSchema.validateSync(returnValue, {
        strict: true,
      });

      return { success: true };
    } catch (_error: unknown) {
      const error = _error as Yup.ValidationError;
      const errorMetadata = getErrorMetadata<SchemaValidationErrorMetadata>({
        error,
      });

      if (errorMetadata) {
        return {
          success: false,
          errorMetadata,
        };
      }
    }

    return { success: true };
  };

  return {
    validateParameters,
    validateReturnValue,
  };
};
