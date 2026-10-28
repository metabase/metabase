import type {
  ActionParameterSchema,
  ActionParametersFromDataAppSchema,
  ActionSchema,
} from "embedding-sdk-package/hooks/public/use-action/types";

const isValueOfType = (
  value: unknown,
  jsType: ActionParameterSchema["jsType"],
): boolean => {
  if (value === null || jsType === undefined || jsType === "unknown") {
    return true;
  }

  switch (jsType) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "Date":
      return typeof value === "string" || value instanceof Date;
  }
};

export const getActionParametersError = (
  action: ActionSchema,
  parameters: Record<string, unknown>,
): string | null => {
  const parametersBySlug = new Map(
    action.parameters.map((parameter) => [parameter.slug, parameter]),
  );

  const unknownSlug = Object.keys(parameters).find(
    (slug) => !parametersBySlug.has(slug),
  );

  if (unknownSlug !== undefined) {
    return `"${unknownSlug}" is not a parameter of the action`;
  }

  const missingParameter = action.parameters.find(
    (parameter) =>
      parameter.required && parameters[parameter.slug] === undefined,
  );

  if (missingParameter) {
    return `"${missingParameter.slug}" is required`;
  }

  const mistypedParameter = action.parameters.find(
    (parameter) =>
      parameters[parameter.slug] !== undefined &&
      !isValueOfType(parameters[parameter.slug], parameter.jsType),
  );

  return mistypedParameter
    ? `"${mistypedParameter.slug}" must be a ${mistypedParameter.jsType} value`
    : null;
};

export const isActionParameters = <TAction extends ActionSchema>(
  action: TAction,
  parameters: Record<string, unknown>,
): parameters is ActionParametersFromDataAppSchema<TAction> =>
  getActionParametersError(action, parameters) === null;
