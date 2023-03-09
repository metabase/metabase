import { t } from "ttag";
import * as Yup from "yup";

import * as Errors from "metabase/core/utils/errors";

import type {
  ActionFormSettings,
  ActionFormOption,
  FieldSettingsMap,
  InputSettingType,
  InputComponentType,
  Parameter,
  WritebackParameter,
} from "metabase-types/api";
import type {
  ActionFormProps,
  ActionFormFieldProps,
  FieldSettings,
} from "metabase/actions/types";

import { sortActionParams, isEditableField } from "metabase/actions/utils";

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
    optional: !fieldSettings.required,
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

const getFieldValidationType = ({
  inputType,
}: FieldSettings): Yup.AnySchema => {
  switch (inputType) {
    case "number":
      return Yup.number().nullable().default(null);
    case "boolean":
      return Yup.boolean().nullable().default(false);
    case "date":
    case "datetime":
    case "time":
      return Yup.string().nullable().default(null);
    default:
      return Yup.string().nullable().default(null);
  }
};

export const getFormValidationSchema = (
  parameters: WritebackParameter[] | Parameter[],
  fieldSettings: FieldSettingsMap = {},
) => {
  const schema = Object.values(fieldSettings)
    .filter(fieldSetting =>
      // only validate fields that are present in the form
      parameters.find(parameter => parameter.id === fieldSetting.id),
    )
    .map(fieldSetting => {
      let yupType = getFieldValidationType(fieldSetting);

      if (fieldSetting.required) {
        yupType = yupType.required(Errors.required);
      }

      return [fieldSetting.id, yupType];
    });
  return Yup.object(Object.fromEntries(schema));
};
