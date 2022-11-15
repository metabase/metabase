import { t } from "ttag";
import _ from "underscore";

import validate from "metabase/lib/validate";
import { humanize, slugify } from "metabase/lib/formatting";

import type {
  ActionFormSettings,
  WritebackAction,
  FieldSettings,
  ParameterId,
  WritebackParameter,
  ActionFormOption,
  ActionFormProps,
  ActionFormFieldProps,
  InputType,
} from "metabase-types/api";

import type { Parameter } from "metabase-types/types/Parameter";
import type { TemplateTag } from "metabase-types/types/Query";

import { isEditableField } from "metabase/writeback/utils";
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

const getOptionsFromArray = (
  options: (number | string)[],
): ActionFormOption[] => options.map(o => ({ name: o, value: o }));

export const getDefaultFieldSettings = (
  overrides: Partial<FieldSettings> = {},
): FieldSettings => ({
  name: "",
  title: "",
  description: "",
  placeholder: "",
  order: 0,
  fieldType: "string",
  inputType: "string",
  required: true,
  hidden: false,
  width: "medium",
  ...overrides,
});

const getSampleOptions = () => [
  { name: t`Option One`, value: 1 },
  { name: t`Option Two`, value: 2 },
  { name: t`Option Three`, value: 3 },
];

type FieldPropTypeMap = Record<InputType, string>;

const fieldPropsTypeMap: FieldPropTypeMap = {
  string: "input",
  text: "text",
  date: "date",
  datetime: "datetime-local",
  monthyear: "date",
  quarteryear: "date",
  email: "email",
  password: "password",
  number: "integer", // this input type is badly named, it works for floats too
  boolean: "boolean",
  category: "categoryPillOrSearch",
  dropdown: "select",
  radio: "radio",
};

const inputTypeHasOptions = (fieldSettings: FieldSettings) =>
  ["dropdown", "radio"].includes(fieldSettings.inputType);

export const getFormField = (
  parameter: Parameter | TemplateTag,
  fieldSettings: FieldSettings,
) => {
  if (
    fieldSettings.fieldInstance &&
    !isEditableField(fieldSettings.fieldInstance, parameter as Parameter)
  ) {
    return undefined;
  }

  const fieldProps: ActionFormFieldProps = {
    name: parameter.id,
    type: fieldPropsTypeMap[fieldSettings?.inputType] ?? "input",
    title:
      fieldSettings.title ||
      fieldSettings.name ||
      parameter.name ||
      parameter.id,
    description: fieldSettings.description ?? "",
    placeholder: fieldSettings?.placeholder,
    validate: fieldSettings.required ? validate.required() : _.noop,
    fieldInstance: fieldSettings.fieldInstance,
  };

  if (inputTypeHasOptions(fieldSettings)) {
    fieldProps.options = fieldSettings.valueOptions?.length
      ? getOptionsFromArray(fieldSettings.valueOptions)
      : getSampleOptions();
  }

  return fieldProps;
};

export const getForm = (
  parameters: WritebackParameter[],
  fieldSettings: Record<string, FieldSettings>,
): ActionFormProps => {
  return {
    fields: parameters
      ?.map(param => getFormField(param, fieldSettings[param.id] ?? {}))
      .filter(Boolean) as ActionFormFieldProps[],
  };
};

export const getFormTitle = (action: WritebackAction): string => {
  let title =
    action.visualization_settings?.name ||
    action.name ||
    humanize(action.slug ?? "") ||
    "Action form";

  if (shouldShowConfirmation(action)) {
    title += "?";
  }

  return title;
};

export const getSubmitButtonColor = (action: WritebackAction): string => {
  if (action.slug === "delete") {
    return "danger";
  }
  return action.visualization_settings?.submitButtonColor ?? "primary";
};

export const getSubmitButtonLabel = (action: WritebackAction): string => {
  if (action.visualization_settings?.submitButtonLabel) {
    return action.visualization_settings.submitButtonLabel;
  }

  if (action.slug === "delete") {
    return t`Delete`;
  }

  if (action.slug === "update") {
    return t`Update`;
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

  params.forEach(param => {
    const field = fieldMetadataMap[param.id]
      ? new Field(fieldMetadataMap[param.id])
      : undefined;

    const name = param.name ?? param.id;
    const displayName = field?.displayName?.() ?? name;

    fieldSettings[param.id] = getDefaultFieldSettings({
      name,
      title: displayName,
      placeholder: displayName,
      required: !!param?.required,
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
  if (field.isDate()) {
    return field.isDateWithoutTime() ? "date" : "datetime";
  }
  if (field.semantic_type === TYPE.Email) {
    return "email";
  }
  if (
    field.semantic_type === TYPE.Description ||
    field.semantic_type === TYPE.Comment ||
    field.base_type === TYPE.Structured
  ) {
    return "text";
  }
  if (field.semantic_type === TYPE.Title) {
    return "string";
  }
  if (field.isCategory() && field.semantic_type !== TYPE.Name) {
    return "category";
  }
  return "string";
};
