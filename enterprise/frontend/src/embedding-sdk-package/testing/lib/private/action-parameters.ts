import type { ExecuteActionParams } from "embedding-sdk-bundle/lib/execute-action";
import type {
  ActionDefinition,
  ActionParametersFromDefinition,
} from "embedding-sdk-package/hooks/public/use-action/types";
import type {
  SchemaJavaScriptType,
  TableFieldSchema,
} from "embedding-sdk-shared/lib/create-metabase-query/schema";

export type ActionParameters = NonNullable<ExecuteActionParams["parameters"]>;

function isValueOfType(
  value: unknown,
  jsType: SchemaJavaScriptType | undefined,
): boolean {
  if (jsType === undefined || jsType === "unknown") {
    return true;
  }

  if (jsType === "Date") {
    return typeof value === "string" || value instanceof Date;
  }

  return typeof value === jsType;
}

export function getActionParametersError(
  action: ActionDefinition,
  parameters: ActionParameters,
): string | null {
  const fieldsBySlug = new Map<string, TableFieldSchema>(
    Object.values(action.table.fields ?? {}).map((field) => [
      field.slug,
      field,
    ]),
  );

  const unknownSlug = Object.keys(parameters).find(
    (slug) => !fieldsBySlug.has(slug),
  );

  if (unknownSlug !== undefined) {
    return `"${unknownSlug}" is not a column of the action's table`;
  }

  const mistypedField = [...fieldsBySlug.values()].find((field) => {
    const value = parameters[field.slug];
    const isEmptyValue = value === undefined || value === null;

    return !isEmptyValue && !isValueOfType(value, field.jsType);
  });

  return mistypedField
    ? `"${mistypedField.slug}" must be a ${mistypedField.jsType} value`
    : null;
}

export function isActionParameters<TAction extends ActionDefinition>(
  action: TAction,
  parameters: ActionParameters,
): parameters is ActionParametersFromDefinition<TAction> {
  return getActionParametersError(action, parameters) === null;
}
