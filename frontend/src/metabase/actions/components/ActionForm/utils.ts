import { t } from "ttag";
import * as Yup from "yup";

import * as Errors from "metabase/core/utils/errors";
import { sortActionParams } from "metabase/actions/utils";

import type {
  ActionFormSettings,
  ActionFormOption,
  FieldType,
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
import type Field from "metabase-lib/metadata/Field";

import { TYPE } from "metabase-lib/types/constants";

export const inputTypeHasOptions = (inputType: InputSettingType) =>
  ["select", "radio"].includes(inputType);

type FieldPropTypeMap = Record<InputSettingType, InputComponentType>;

const fieldPropsTypeMap: FieldPropTypeMap = {
  string: "text",
  text: "textarea",
  date: "date",
  datetime: "datetime-local",
  time: "time",
  number: "number",
  boolean: "boolean",
  select: "select",
  radio: "radio",
};

const getOptionsFromArray = (
  options: (number | string)[],
): ActionFormOption[] => options.map(o => ({ name: o, value: o }));

function getSampleOptions(fieldType: FieldType) {
  return fieldType === "number"
    ? getOptionsFromArray([1, 2, 3])
    : getOptionsFromArray([t`Option One`, t`Option Two`, t`Option Three`]);
}

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

const isEditableField = (field: Field, parameter: Parameter) => {
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

const getFormField = (parameter: Parameter, fieldSettings: FieldSettings) => {
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

  if (inputTypeHasOptions(fieldSettings.inputType)) {
    fieldProps.options = fieldSettings.valueOptions?.length
      ? getOptionsFromArray(fieldSettings.valueOptions)
      : getSampleOptions(fieldSettings.fieldType);
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
  defaultValue,
}: FieldSettings): Yup.AnySchema => {
  switch (inputType) {
    case "number":
      return Yup.number()
        .nullable()
        .default(defaultValue != null ? Number(defaultValue) : null);
    case "boolean":
      return Yup.boolean()
        .nullable()
        .default(defaultValue != null ? Boolean(defaultValue) : false);
    case "date":
    case "datetime":
    case "time":
      return Yup.string()
        .nullable()
        .default(defaultValue != null ? String(defaultValue) : null);
    default:
      return Yup.string()
        .nullable()
        .default(defaultValue != null ? String(defaultValue) : null);
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
