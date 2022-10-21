import { t } from "ttag";

import validate from "metabase/lib/validate";
import { slugify } from "metabase/lib/formatting";

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
import type { Field as FieldType } from "metabase-types/types/Field";

import Field from "metabase-lib/lib/metadata/Field";
import { TYPE } from "metabase-lib/lib/types/constants";

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
  datetime: "date",
  monthyear: "date",
  quarteryear: "date",
  email: "email",
  password: "password",
  number: "integer", // this input type is badly named, it works for floats too
  boolean: "boolean",
  category: "category",
  dropdown: "select",
  radio: "radio",
};

const inputTypeHasOptions = (fieldSettings: FieldSettings) =>
  ["dropdown", "radio"].includes(fieldSettings.inputType);

const dontValidate = () => undefined;

export const getFormField = (
  parameter: Parameter | TemplateTag,
  fieldSettings: FieldSettings,
) => {
  const fieldProps: ActionFormFieldProps = {
    name: parameter.id,
    type: fieldPropsTypeMap[fieldSettings?.inputType] ?? "input",
    title: fieldSettings.title ?? fieldSettings.name,
    description: fieldSettings.description ?? "",
    placeholder: fieldSettings?.placeholder,
    validate: fieldSettings.required ? validate.required() : dontValidate,
    fieldInstance: fieldSettings.fieldInstance,
  };

  if (inputTypeHasOptions(fieldSettings)) {
    fieldProps.options = fieldSettings.valueOptions?.length
      ? getOptionsFromArray(fieldSettings.valueOptions)
      : getSampleOptions();
  }

  if (fieldProps.type === "date") {
    fieldProps.values = {};
  }

  return fieldProps;
};

export const getForm = (
  parameters: WritebackParameter[],
  fieldSettings: Record<string, FieldSettings>,
): ActionFormProps => {
  return {
    fields: parameters?.map(param =>
      getFormField(param, fieldSettings[param.id] ?? {}),
    ),
  };
};

export const getFormTitle = (action: WritebackAction): string =>
  action.visualization_settings?.name ||
  action.name ||
  action.slug ||
  "Action form";

export const getSubmitButtonLabel = (action: WritebackAction): string =>
  action.visualization_settings?.submitButtonLabel || t`Save`;

export const generateFieldSettingsFromParameters = (
  params: Parameter[],
  fields?: FieldType[],
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
      required: !!field?.database_required,
      description: field?.description ?? "",
      fieldType: getFieldType(param),
      inputType: getInputType(param, field),
      fieldInstance: field ?? undefined,
    });
  });
  return fieldSettings;
};

const getFieldType = (param: Parameter): "number" | "string" => {
  return /integer|float/gi.test(param.type) ? "number" : "string";
};

function getInputType(param: Parameter, field?: Field) {
  if (!field) {
    return /integer|float/gi.test(param.type) ? "number" : "string";
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
    return "date";
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
}
