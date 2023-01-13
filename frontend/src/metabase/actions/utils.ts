import { t } from "ttag";
import _ from "underscore";
import moment from "moment-timezone";

import { moveElement } from "metabase/core/utils/arrays";
import { slugify } from "metabase/lib/formatting";
import { isEmpty } from "metabase/lib/validate";

import type {
  ActionFormSettings,
  Database,
  Field as FieldObject,
  FieldSettings,
  FieldSettingsMap,
  InputSettingType,
  Parameter,
  ParameterId,
  ParametersForActionExecution,
  WritebackAction,
} from "metabase-types/api";

import { TYPE } from "metabase-lib/types/constants";
import Field from "metabase-lib/metadata/Field";

export const checkDatabaseSupportsActions = (database: Database) =>
  database.features.includes("actions");

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
    const aOrder = formSettings.fields[a.id]?.order ?? 0;
    const bOrder = formSettings.fields[b.id]?.order ?? 0;

    return aOrder - bOrder;
  };

export const getChangedValues = (
  newValues: ParametersForActionExecution,
  oldValues: Partial<ParametersForActionExecution>,
) => {
  const changedValues = Object.entries(newValues).filter(
    ([newKey, newValue]) => {
      const oldValue = oldValues[newKey];
      return newValue !== oldValue;
    },
  );

  return Object.fromEntries(changedValues);
};

export const formatValue = (
  value: string | number | null,
  inputType?: InputSettingType,
) => {
  if (!isEmpty(value)) {
    if (inputType === "date" && moment(value).isValid()) {
      return moment(value).utc(false).format("YYYY-MM-DD");
    }
    if (inputType === "datetime" && moment(value).isValid()) {
      return moment(value).utc(false).format("YYYY-MM-DDTHH:mm:ss");
    }
    if (inputType === "time") {
      return String(value).replace(/z/gi, "");
    }
  }
  return value;
};

export const getInitialValues = (
  fieldSettings: FieldSettingsMap,
  prefetchValues: ParametersForActionExecution,
) => {
  return Object.fromEntries(
    Object.values(fieldSettings).map(field => [
      field.id,
      formatValue(prefetchValues[field.id], field.inputType),
    ]),
  );
};

export const getDefaultFormSettings = (
  overrides: Partial<ActionFormSettings> = {},
): ActionFormSettings => ({
  name: "",
  type: "button",
  description: "",
  fields: {},
  confirmMessage: "",
  ...overrides,
});

export const getDefaultFieldSettings = (
  overrides: Partial<FieldSettings> = {},
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

export const getFormTitle = (action: WritebackAction): string => {
  return action.visualization_settings?.name || action.name || t`Action form`;
};

export const getSubmitButtonColor = (action: WritebackAction): string => {
  if (action.type === "implicit" && action.kind === "row/delete") {
    return "danger";
  }
  return action.visualization_settings?.submitButtonColor ?? "primary";
};

export const getSubmitButtonLabel = (action: WritebackAction): string => {
  if (action.visualization_settings?.submitButtonLabel) {
    return action.visualization_settings.submitButtonLabel;
  }

  if (action.type === "implicit") {
    if (action.kind === "row/delete") {
      return t`Delete`;
    }

    if (action.kind === "row/update") {
      return t`Update`;
    }
  }

  return t`Save`;
};

export const generateFieldSettingsFromParameters = (
  params: Parameter[],
  fields?: Field[] | FieldObject[],
) => {
  const fieldSettings: Record<ParameterId, FieldSettings> = {};

  const fieldMetadataMap = Object.fromEntries(
    fields?.map(f => [slugify(f.name), f]) ?? [],
  );

  params.forEach((param, index) => {
    const field = fieldMetadataMap[param.id]
      ? new Field(fieldMetadataMap[param.id])
      : undefined;

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
      field: field ?? undefined,
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
    return "category";
  }
  return "string";
};

export const reorderFields = (
  fields: FieldSettingsMap,
  oldIndex: number,
  newIndex: number,
) => {
  // we have to jump through some hoops here because fields settings are an unordered map
  // with order properties
  const fieldsWithIds = _.mapObject(fields, (field, key) => ({
    ...field,
    id: key,
  }));
  const orderedFields = _.sortBy(Object.values(fieldsWithIds), "order");
  const reorderedFields = moveElement(orderedFields, oldIndex, newIndex);

  const fieldsWithUpdatedOrderProperty = reorderedFields.map(
    (field, index) => ({
      ...field,
      order: index,
    }),
  );

  return _.indexBy(fieldsWithUpdatedOrderProperty, "id");
};

export const hasNewParams = (
  params: Parameter[],
  formSettings: ActionFormSettings,
) => !!params.find(param => !formSettings.fields[param.id]);
