import { t } from "ttag";
import _ from "underscore";

import { getColumnIcon } from "metabase/common/utils/columns";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import * as Lib from "metabase-lib";
import { getRemappings } from "metabase-lib/v1/queries/utils/field";
import { isEntityName, isFK } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, FieldValue, Table } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import type { RemappingValue } from "./DisplayValuesPicker";

export function getFkTargetTableEntityNameOrNull(
  targetTable: Table | undefined,
): FieldId | undefined {
  const fields = getTableFields(targetTable);
  const nameField = fields.find((field) => isEntityName(field));
  return nameField ? getRawTableFieldId(nameField) : undefined;
}

export function getOptions(
  field: Field,
  fieldValues: FieldValue[] | undefined,
  fkTargetTable: Table | undefined,
) {
  const options: RemappingValue[] = ["original"];

  if (hasForeignKeyTargetFields(field, fkTargetTable)) {
    options.push("foreign");
  }

  if (hasMappableNumeralValues(fieldValues)) {
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

function hasMappableNumeralValues(
  fieldValues: FieldValue[] | undefined,
): boolean {
  const remapping = getFieldRemappedValues(fieldValues);

  // Only show the "custom" option if we have some values that can be mapped to user-defined custom values
  // (for a field without user-defined remappings, every key of `field.remappings` has value `undefined`)
  return (
    remapping.size > 0 &&
    [...remapping.keys()].every(
      (key) => typeof key === "number" || key === null,
    )
  );
}

export function is403Error(error: unknown): boolean {
  return isObject(error) && error.status === 403;
}

export function getFieldRemappedValues(
  fieldValues: FieldValue[] | undefined,
): Map<number, string> {
  return new Map(getRemappings({ values: fieldValues }));
}

/**
 * Adds 3 extra attributes to every Field, so that DataSelector does not break.
 * DataSelector component expects metabase-lib/v1/metadata/Field objects (entity framework),
 * but this modern module uses Field from metabase-types/api/field.ts instead.
 */
export function hydrateTableFields(
  table: Table | undefined,
): Table | undefined {
  if (!table) {
    return undefined;
  }

  return {
    ...table,
    fields: table.fields?.map((field) => ({
      ...field,
      displayName: () => field.display_name,
      icon: () => getColumnIcon(Lib.legacyColumnTypeInfo(field)),
      table,
    })),
  };
}
