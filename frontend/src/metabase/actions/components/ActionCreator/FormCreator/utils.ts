import { t } from "ttag";
import _ from "underscore";

import { slugify } from "metabase/lib/formatting";
import { moveElement } from "metabase/lib/array";

import type {
  ActionFormSettings,
  WritebackAction,
  FieldSettings,
  FieldSettingsMap,
  ParameterId,
} from "metabase-types/api";

import type { Parameter } from "metabase-types/types/Parameter";

import Field from "metabase-lib/metadata/Field";
import { TYPE } from "metabase-lib/types/constants";

import { shouldShowConfirmation } from "../../ActionViz/utils";

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
  let title =
    action.visualization_settings?.name || action.name || t`Action form`;

  if (shouldShowConfirmation(action)) {
    title += "?";
  }

  return title;
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
  fields?: Field[],
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
      fieldInstance: field ?? undefined,
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
