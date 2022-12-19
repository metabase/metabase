import { t } from "ttag";
import _ from "underscore";
import validate from "metabase/lib/validate";

import type {
  ActionFormSettings,
  FieldSettings,
  WritebackParameter,
  ActionFormProps,
  ActionFormFieldProps,
  ActionFormOption,
  InputSettingType,
  InputComponentType,
} from "metabase-types/api";

import { sortActionParams, isEditableField } from "metabase/actions/utils";
import type { Parameter } from "metabase-types/types/Parameter";

const getOptionsFromArray = (
  options: (number | string)[],
): ActionFormOption[] => options.map(o => ({ name: o, value: o }));

const getSampleOptions = () => [
  { name: t`Option One`, value: 1 },
  { name: t`Option Two`, value: 2 },
  { name: t`Option Three`, value: 3 },
];

const inputTypeHasOptions = (fieldSettings: FieldSettings) =>
  ["select", "radio"].includes(fieldSettings.inputType);

type FieldPropTypeMap = Record<InputSettingType, InputComponentType>;

const fieldPropsTypeMap: FieldPropTypeMap = {
  string: "text",
  text: "textarea",
  date: "date",
  datetime: "datetime-local",
  time: "time",
  number: "number",
  boolean: "boolean",
  category: "category",
  select: "select",
  radio: "radio",
};

export const getFormField = (
  parameter: Parameter,
  fieldSettings: FieldSettings,
) => {
  if (
    fieldSettings.field &&
    !isEditableField(fieldSettings.field, parameter as Parameter)
  ) {
    return undefined;
  }

  const fieldProps: ActionFormFieldProps = {
    name: parameter.id,
    type: fieldPropsTypeMap[fieldSettings?.inputType] ?? "text",
    title:
      fieldSettings.title ||
      fieldSettings.name ||
      parameter["display-name"] ||
      parameter.name ||
      parameter.id,
    description: fieldSettings.description ?? "",
    placeholder: fieldSettings?.placeholder,
    required: fieldSettings.required,
    validate: fieldSettings.required ? validate.required() : _.noop,
    field: fieldSettings.field,
  };

  if (inputTypeHasOptions(fieldSettings)) {
    fieldProps.options = fieldSettings.valueOptions?.length
      ? getOptionsFromArray(fieldSettings.valueOptions)
      : getSampleOptions();
  }

  return fieldProps;
};

export const getForm = (
  parameters: WritebackParameter[] | Parameter[],
  fieldSettings: Record<string, FieldSettings> = {},
): ActionFormProps => {
  const sortedParams = parameters.sort(
    sortActionParams({ fields: fieldSettings } as ActionFormSettings),
  );
  return {
    fields: sortedParams
      ?.map(param => getFormField(param, fieldSettings[param.id] ?? {}))
      .filter(Boolean) as ActionFormFieldProps[],
  };
};
