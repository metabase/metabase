import { t } from "ttag";

import type {
  ActionFormSettings,
  Database,
  Parameter,
  WritebackAction,
  WritebackActionBase,
  ActionDashboardCard,
  BaseDashboardOrderedCard,
  Card,
  FieldSettings,
  FieldSettingsMap,
  ParameterId,
  ParametersForActionExecution,
  ImplicitQueryAction,
} from "metabase-types/api";

import { getResponseErrorMessage } from "metabase/core/utils/errors";
import { slugify, humanize } from "metabase/lib/formatting";
import { isEmpty } from "metabase/lib/validate";

import { TYPE } from "metabase-lib/types/constants";
import Field from "metabase-lib/metadata/Field";

import type { FieldSettings as LocalFieldSettings } from "./types";

export const checkDatabaseActionsEnabled = (database: Database) =>
  !!database.settings?.["database-enable-actions"];

const AUTOMATIC_DATE_TIME_FIELDS = [
  TYPE.CreationDate,
  TYPE.CreationTemporal,
  TYPE.CreationTime,
  TYPE.CreationTimestamp,

  TYPE.DeletionDate,
  TYPE.DeletionTemporal,
  TYPE.DeletionTime,
  TYPE.DeletionTimestamp,

  TYPE.UpdatedDate,
  TYPE.UpdatedTemporal,
  TYPE.UpdatedTime,
  TYPE.UpdatedTimestamp,
];

const isAutomaticDateTimeField = (field: Field) => {
  return AUTOMATIC_DATE_TIME_FIELDS.includes(field.semantic_type);
};

export const isEditableField = (field: Field, parameter: Parameter) => {
  const isRealField = typeof field.id === "number";
  if (!isRealField) {
    // Filters out custom, aggregated columns, etc.
    return false;
  }

  if (field.isPK()) {
    // Most of the time PKs are auto-generated,
    // but there are rare cases when they're not
    // In this case they're marked as `required`
    return parameter.required;
  }

  if (isAutomaticDateTimeField(field)) {
    return parameter.required;
  }

  return true;
};

export const hasImplicitActions = (actions: WritebackAction[]): boolean =>
  actions.some(isImplicitAction);

export const isImplicitAction = (action: WritebackAction): boolean =>
  action.type === "implicit";

export const shouldPrefetchValues = (action: WritebackAction) => {
  // in the future there should be a setting to configure this
  // for custom actions
  return action.type === "implicit" && action.kind === "row/update";
};

export const sortActionParams =
  (formSettings: ActionFormSettings) => (a: Parameter, b: Parameter) => {
    const fields = formSettings.fields || {};

    const aOrder = fields[a.id]?.order ?? 0;
    const bOrder = fields[b.id]?.order ?? 0;

    return aOrder - bOrder;
  };

export const getDefaultFormSettings = (
  overrides: Partial<ActionFormSettings> = {},
): ActionFormSettings => ({
  name: "",
  type: "button",
  description: "",
  fields: {},
  confirmMessage: "",
  successMessage: "",
  ...overrides,
});

export const getSuccessMessage = (action: WritebackAction) => {
  return (
    action.visualization_settings?.successMessage ||
    t`${action.name} ran successfully`
  );
};

export const getDefaultFieldSettings = (
  overrides: Partial<LocalFieldSettings> = {},
): FieldSettings => ({
  id: "",
  name: "",
  title: "",
  description: "",
  placeholder: "",
  order: 999,
  fieldType: "string",
  inputType: "string",
  required: true,
  hidden: false,
  width: "medium",
  ...overrides,
});

export const generateFieldSettingsFromParameters = (
  params: Parameter[],
  fields?: Field[],
) => {
  const fieldSettings: Record<ParameterId, LocalFieldSettings> = {};

  const fieldMetadataMap = Object.fromEntries(
    fields?.map(f => [slugify(f.name), f]) ?? [],
  );

  params.forEach((param, index) => {
    const field = fieldMetadataMap[param.id]
      ? new Field(fieldMetadataMap[param.id])
      : new Field({
          id: param.id,
          name: param.id,
          slug: param.id,
          display_name: humanize(param.id),
          base_type: param.type,
          semantic_type: param.type,
        });

    const name = param["display-name"] ?? param.name ?? param.id;
    const displayName = field?.displayName?.() ?? name;

    fieldSettings[param.id] = getDefaultFieldSettings({
      id: param.id,
      name,
      title: displayName,
      placeholder: displayName,
      required: !!param?.required,
      order: index,
      description: field?.description ?? "",
      fieldType: getFieldType(param),
      inputType: getInputType(param, field),
    });
  });
  return fieldSettings;
};

const getFieldType = (param: Parameter): "number" | "string" => {
  return isNumericParameter(param) ? "number" : "string";
};

const isNumericParameter = (param: Parameter): boolean =>
  /integer|float/gi.test(param.type);

export const getInputType = (param: Parameter, field?: Field) => {
  if (!field) {
    return isNumericParameter(param) ? "number" : "string";
  }

  if (field.isFK()) {
    return field.isNumeric() ? "number" : "string";
  }
  if (field.isNumeric()) {
    return "number";
  }
  if (field.isBoolean()) {
    return "boolean";
  }
  if (field.isTime()) {
    return "time";
  }
  if (field.isDate()) {
    return field.isDateWithoutTime() ? "date" : "datetime";
  }
  if (
    field.semantic_type === TYPE.Description ||
    field.semantic_type === TYPE.Comment ||
    field.base_type === TYPE.Structured
  ) {
    return "text";
  }
  if (
    field.semantic_type === TYPE.Title ||
    field.semantic_type === TYPE.Email
  ) {
    return "string";
  }
  if (field.isCategory() && field.semantic_type !== TYPE.Name) {
    return "string";
  }
  return "string";
};

export function isSavedAction(
  action?: Partial<WritebackActionBase>,
): action is WritebackAction {
  return action != null && action.id != null;
}

export function isActionDashCard(
  dashCard: BaseDashboardOrderedCard,
): dashCard is ActionDashboardCard {
  const virtualCard = dashCard?.visualization_settings?.virtual_card;
  return isActionCard(virtualCard as Card);
}

export const isActionCard = (card: Card) => card?.display === "action";

export const getFormTitle = (action: WritebackAction): string => {
  return action.visualization_settings?.name || action.name || t`Action form`;
};

export function setNumericValues(
  params: ParametersForActionExecution,
  fieldSettings: FieldSettingsMap,
) {
  Object.entries(params).forEach(([key, value]) => {
    if (fieldSettings[key]?.fieldType === "number" && !isEmpty(value)) {
      params[key] = Number(value) ?? null;
    }
  });

  return params;
}

function hasDataFromExplicitAction(result: any) {
  const isInsert = result["created-row"];
  const isUpdate =
    result["rows-affected"] > 0 || result["rows-updated"]?.[0] > 0;
  const isDelete = result["rows-deleted"]?.[0] > 0;
  return !isInsert && !isUpdate && !isDelete;
}

function getImplicitActionExecutionMessage(action: ImplicitQueryAction) {
  if (action.kind === "row/create") {
    return t`Successfully saved`;
  }
  if (action.kind === "row/update") {
    return t`Successfully updated`;
  }
  if (action.kind === "row/delete") {
    return t`Successfully deleted`;
  }
  return t`Successfully ran the action`;
}

export function getActionExecutionMessage(
  action: WritebackAction,
  result: any,
) {
  if (action.type === "implicit") {
    return getImplicitActionExecutionMessage(action);
  }
  if (hasDataFromExplicitAction(result)) {
    return t`Success! The action returned: ${JSON.stringify(result)}`;
  }
  return getSuccessMessage(action);
}

export function getActionErrorMessage(error: unknown) {
  return (
    getResponseErrorMessage(error) ??
    t`Something went wrong while executing the action`
  );
}
