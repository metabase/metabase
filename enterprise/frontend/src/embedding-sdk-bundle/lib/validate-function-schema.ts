import type { ZodMiniFunction, ZodMiniTuple, core } from "zod/mini";
import { safeParse } from "zod/mini";

import type {
  FunctionParametersSchemaValidationErrorMetadata,
  FunctionSchemaValidationResult,
  SchemaValidationErrorMetadata,
} from "embedding-sdk-shared/types/validation";

type FunctionSchema = ZodMiniFunction<ZodMiniTuple<any, null> | never, any>;

const getErrorMetadata = <
  TMetadata extends
    | SchemaValidationErrorMetadata
    | FunctionParametersSchemaValidationErrorMetadata,
>({
  error,
  parameterIndex,
}: {
  error: core.$ZodError;
  parameterIndex?: number;
}): TMetadata | null => {
  for (const issue of error.issues) {
    switch (issue.code) {
      case "invalid_type":
        if (issue.expected !== "nonoptional") {
          break;
        }

        return {
          errorCode: "missing_required_property",
          data: issue.path[0].toString() ?? "",
          parameterIndex,
        } as TMetadata;
      case "unrecognized_keys":
        return {
          errorCode: "unrecognized_keys",
          data: issue.keys[0].toString() ?? "",
          parameterIndex,
        } as TMetadata;
    }
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
  const parameterSchemas = schema.def.input.def.items;
  const returnValueSchema = schema.def.output.def;

  const validateParameters = (parameters: TParameters) => {
    for (let i = 0; i < parameters.length; i++) {
      const parameter = parameters[i];
      const parameterSchema = parameterSchemas[i];

      const parseResult = safeParse(parameterSchema, parameter);

      if (!parseResult.success) {
        const errorMetadata =
          getErrorMetadata<FunctionParametersSchemaValidationErrorMetadata>({
            error: parseResult.error,
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
    const parseResult = safeParse(returnValueSchema, returnValue);

    if (!parseResult.success) {
      const errorMetadata = getErrorMetadata<SchemaValidationErrorMetadata>({
        error: parseResult.error,
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
