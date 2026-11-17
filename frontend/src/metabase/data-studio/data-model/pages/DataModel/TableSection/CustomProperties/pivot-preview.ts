import _ from "underscore";

import { dayjs } from "metabase/dayjs";
import {
  type PropertySampleRow,
  type RegistryProperty,
  conformsToType,
} from "metabase/metadata/table-structure";
import type { RowValue } from "metabase-types/api";

export type PivotedEntity = {
  entityKey: RowValue;
  valuesByProperty: Map<string, string>;
};

export function pivotSampleRows(
  rows: PropertySampleRow[],
  properties: RegistryProperty[],
): PivotedEntity[] {
  const propertyByKey = new Map(
    properties.map((property) => [property.key, property]),
  );
  const keyByName = new Map(
    properties.map((property) => [property.name, property.key]),
  );
  const rowsByEntity = _.groupBy(rows, (row) => String(row.entityKey));
  return Object.values(rowsByEntity).map((entityRows) => ({
    entityKey: entityRows[0].entityKey,
    valuesByProperty: new Map(
      entityRows.map((row) => {
        const property = propertyByKey.get(row.propertyKey);
        const targetKey = property?.mergedInto
          ? (keyByName.get(property.mergedInto) ?? row.propertyKey)
          : row.propertyKey;
        return [targetKey, row.value];
      }),
    ),
  }));
}

export function formatPropertyValue(
  property: RegistryProperty,
  value: string | undefined,
): string | null {
  if (value == null || value === "") {
    return null;
  }
  if (!conformsToType(value, property.type)) {
    return null;
  }
  if (property.type === "date") {
    return dayjs(value).format("MMM D, YYYY");
  }
  if (property.type === "boolean") {
    return value.toLowerCase() === "true" ? "Yes" : "No";
  }
  if (property.semanticType === "type/Currency") {
    return `$${Number(value).toLocaleString()}`;
  }
  return value;
}
