import _ from "underscore";

import { moveElement } from "metabase/lib/arrays";
import type { FieldSettingsMap, InputSettingType } from "metabase-types/api";

const inputTypeMap: Record<InputSettingType, string> = {
  string: "text",
  text: "textarea",
  date: "date",
  datetime: "datetime-local",
  time: "time",
  number: "number",
  boolean: "boolean",
  select: "text",
  radio: "text",
};

export const getDefaultValueInputType = (inputType: InputSettingType) => {
  return inputTypeMap[inputType];
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
