/* @flow weak */

import _ from "underscore";

export function getField(table, fieldId) {
  if (table) {
    // sometimes we populate fields_lookup, sometimes we don't :(
    if (table.fields_lookup) {
      return table.fields_lookup[fieldId];
    } else {
      return _.find(table.fields, field => _.isEqual(field.id, fieldId));
    }
  }
}
