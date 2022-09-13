import { t } from "ttag";

import type {
  ActionFormSettings,
  WritebackAction,
  FieldSettings,
} from "metabase-types/api";
import type { Parameter } from "metabase-types/types/Parameter";
import type { TemplateTag } from "metabase-types/types/Query";

export const getDefaultFormSettings = (
  overrides: Partial<ActionFormSettings> = {},
): ActionFormSettings => ({
  name: "",
  type: "inline",
  description: "",
  fields: {},
  confirmMessage: "",
  ...overrides,
});

export const getDefaultFieldSettings = (
  overrides: Partial<FieldSettings> = {},
): FieldSettings => ({
  name: "",
  order: 0,
  description: "",
  placeholder: "",
  fieldType: "string",
  inputType: "string",
  required: false,
  hidden: false,
  width: "medium",
  ...overrides,
});

const getSampleOptions = () => [
  { name: t`Option One`, value: 1 },
  { name: t`Option Two`, value: 2 },
  { name: t`Option Three`, value: 3 },
];

const getParameterFieldProps = (fieldSettings: FieldSettings) => {
  switch (fieldSettings.inputType) {
    case "string":
      return { type: "input" };
    case "text":
      return { type: "text" };
    case "number":
      return { type: "integer" };
    case "date":
    case "datetime":
    case "monthyear":
    case "quarteryear":
      return { type: "date", values: {} };
    case "dropdown":
      return {
        type: "select",
        options: fieldSettings.valueOptions ?? getSampleOptions(),
      };
    case "inline-select":
      return {
        type: "radio",
        options: fieldSettings.valueOptions ?? getSampleOptions(),
      };
    default:
      return { type: "input" };
  }
};

export const getFormFieldForParameter = (
  parameter: Parameter | TemplateTag,
  fieldSettings: FieldSettings,
) => ({
  name: parameter.id,
  title: parameter.name,
  ...getParameterFieldProps(fieldSettings),
});

export const getFormTitle = (action: WritebackAction): string =>
  action.visualization_settings?.name || action.name || "Action form";

export const getSubmitButtonLabel = (action: WritebackAction): string =>
  action.visualization_settings?.submitButtonLabel || t`Save`;
