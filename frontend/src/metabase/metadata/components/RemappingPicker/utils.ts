import { t } from "ttag";
import _ from "underscore";

import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { getRemappings } from "metabase-lib/v1/queries/utils/field";
import { isEntityName, isFK } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, Table } from "metabase-types/api";

import type { RemappingValue } from "../DisplayValuesPicker";

export function getFkTargetTableEntityNameOrNull(
  targetTable: Table | undefined,
): FieldId | undefined {
  const fields = getTableFields(targetTable);
  const nameField = fields.find((field) => isEntityName(field));
  return nameField ? getRawTableFieldId(nameField) : undefined;
}

export function getOptions(field: Field, fkTargetTable: Table | undefined) {
  const options: RemappingValue[] = ["original"];

  if (hasForeignKeyTargetFields(field, fkTargetTable)) {
    options.push("foreign");
  }

  if (hasMappableNumeralValues(field)) {
    options.push("custom");
  }

  return options;
}

export function getValue(field: Field): RemappingValue {
  if (_.isEmpty(field.dimensions)) {
    return "original";
  }

  if (field.dimensions?.[0]?.type === "external") {
    return "foreign";
  }

  if (field.dimensions?.[0]?.type === "internal") {
    return "custom";
  }

  throw new Error(t`Unrecognized mapping type`);
}

function hasForeignKeyTargetFields(
  field: Field,
  fkTargetTable: Table | undefined,
): boolean {
  return isFK(field) && getTableFields(fkTargetTable).length > 0;
}

function getTableFields(table: Table | undefined): Field[] {
  return table?.fields ?? [];
}

function hasMappableNumeralValues(field: Field): boolean {
  const remapping = new Map(getRemappings(field));

  // Only show the "custom" option if we have some values that can be mapped to user-defined custom values
  // (for a field without user-defined remappings, every key of `field.remappings` has value `undefined`)
  return (
    remapping.size > 0 &&
    [...remapping.keys()].every(
      (key) => typeof key === "number" || key === null,
    )
  );
}
