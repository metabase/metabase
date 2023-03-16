import _ from "underscore";

import { moveElement } from "metabase/core/utils/arrays";

import type { FieldSettingsMap } from "metabase-types/api";

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
