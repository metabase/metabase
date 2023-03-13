import { t } from "ttag";
import _ from "underscore";
import { moveElement } from "metabase/core/utils/arrays";
import {
  FieldSettingsMap,
  InputSettingType,
  WritebackAction,
} from "metabase-types/api";

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

    if (action.kind === "row/create") {
      return t`Save`;
    }
  }

  return t`Run`;
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

const inputTypeMap: Record<InputSettingType, string> = {
  string: "text",
  text: "textarea",
  date: "date",
  datetime: "datetime-local",
  time: "time",
  number: "number",
  boolean: "boolean",
  category: "text",
  select: "text",
  radio: "text",
};

export const getDefaultValueInputType = (inputType: InputSettingType) => {
  return inputTypeMap[inputType];
};
