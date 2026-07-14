import { ValidationError } from "yup";

import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";
import type {
  FunctionSchemaValidationResult,
  SchemaValidationErrorMetadata,
} from "embedding-sdk-shared/types/validation";

const getErrorMetadata = (
  error: ValidationError,
): SchemaValidationErrorMetadata | null => {
  switch (error.type) {
    case "required":
      return {
        errorCode: "missing_required_property",
        data: String(error.params?.path ?? ""),
      };
    case "has-entity-prop":
      return {
        errorCode: "missing_required_property",
        data: "questionId, token, or query",
      };
    case "noUnknown":
      return {
        errorCode: "unrecognized_keys",
        data: String(error.params?.unknown ?? ""),
      };
  }

  return null;
};

/**
 * Schema violations surface as `ValidationError`; anything else thrown by
 * `validateSync` is not a schema problem and carries no metadata.
 */
const getThrownErrorMetadata = (
  error: unknown,
): SchemaValidationErrorMetadata | null =>
  ValidationError.isError(error) ? getErrorMetadata(error) : null;

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
      } catch (error: unknown) {
        const errorMetadata = getThrownErrorMetadata(error);

        if (errorMetadata) {
          return {
            success: false,
            errorMetadata: { ...errorMetadata, parameterIndex: i },
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
    } catch (error: unknown) {
      const errorMetadata = getThrownErrorMetadata(error);

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
