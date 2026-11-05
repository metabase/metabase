import { keyBy, mapValues, sortBy } from "es-toolkit";

import { moveElement } from "metabase/utils/arrays";
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
  const fieldsWithIds = mapValues(fields, (field, key) => ({
    ...field,
    id: key,
  }));
  const orderedFields = sortBy(Object.values(fieldsWithIds), [
    (item) => item.order,
  ]);
  const reorderedFields = moveElement(orderedFields, oldIndex, newIndex);

  const fieldsWithUpdatedOrderProperty = reorderedFields.map(
    (field, index) => ({
      ...field,
      order: index,
    }),
  );

  return keyBy(fieldsWithUpdatedOrderProperty, (item) => item.id);
};
