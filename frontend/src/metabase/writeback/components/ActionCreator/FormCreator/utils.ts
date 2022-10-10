import { t } from "ttag";

import type {
  ActionFormSettings,
  WritebackAction,
  FieldSettings,
  ParameterId,
} from "metabase-types/api";

import validate from "metabase/lib/validate";
import type { Parameter } from "metabase-types/types/Parameter";
import type { TemplateTag } from "metabase-types/types/Query";
import type { Validator } from "metabase-types/forms";

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

type OptionType = {
  name: string | number;
  value: string | number;
};

const getOptionsFromArray = (options: (number | string)[]): OptionType[] =>
  options.map(o => ({ name: o, value: o }));

export const getDefaultFieldSettings = (
  overrides: Partial<FieldSettings> = {},
): FieldSettings => ({
  name: "",
  order: 0,
  description: "",
  placeholder: "",
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

interface FieldPropTypeMap {
  [key: string]: string;
}

const fieldPropsTypeMap: FieldPropTypeMap = {
  string: "input",
  text: "text",
  date: "date",
  datetime: "date",
  monthyear: "date",
  quarteryear: "date",
  dropdown: "select",
  "inline-select": "radio",
};

const inputTypeHasOptions = (fieldSettings: FieldSettings) =>
  ["dropdown", "inline-select"].includes(fieldSettings.inputType);

interface FieldProps {
  type: string;
  options?: OptionType[];
  values?: any;
  placeholder?: string;
  validate?: Validator;
}

const getParameterFieldProps = (fieldSettings: FieldSettings) => {
  const fieldProps: FieldProps = {
    type: fieldPropsTypeMap[fieldSettings?.inputType] ?? "input",
    placeholder: fieldSettings.placeholder ?? "",
    validate: fieldSettings.required ? validate.required() : () => undefined,
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

export const getFormFieldForParameter = (
  parameter: Parameter | TemplateTag,
  fieldSettings: FieldSettings,
) => ({
  name: parameter.id,
  title: parameter.name ?? parameter.id,
  ...getParameterFieldProps(fieldSettings),
});

export const getFormTitle = (action: WritebackAction): string =>
  action.visualization_settings?.name || action.name || "Action form";

export const getSubmitButtonLabel = (action: WritebackAction): string =>
  action.visualization_settings?.submitButtonLabel || t`Save`;

export const generateFieldSettingsFromParameters = (params: Parameter[]) => {
  const fieldSettings: Record<ParameterId, FieldSettings> = {};

  params.forEach(param => {
    fieldSettings[param.id] = getDefaultFieldSettings({
      name: param.name ?? param.id,
      fieldType: param.type.includes("Integer") ? "number" : "string",
      inputType: param.type.includes("Integer") ? "number" : "string",
    });
  });
  return fieldSettings;
};
