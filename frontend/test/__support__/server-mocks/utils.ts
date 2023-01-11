import _ from "underscore";
import type { Table as TableObject } from "metabase-types/api";
import type Table from "metabase-lib/metadata/Table";

const TABLE_IGNORE_PROPERTIES = [
  "fields",
  "metrics",
  "segments",
  "schema",
  "schema_name",
];

export function cleanTable(table: Table): TableObject {
  const plainObject = table.getPlainObject();
  const cleanObject = _.omit(plainObject, ...TABLE_IGNORE_PROPERTIES);
  return {
    dimension_options: {},
    ...cleanObject,
    // After table is built inside the metadata object,
    // what is normally called "schema" is renamed to "schema_name"
    schema: table.schema_name,
  } as TableObject;
}
