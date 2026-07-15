import { t } from "ttag";
import _ from "underscore";

import { getColumnIcon } from "metabase/common/utils/columns";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { is403Error } from "metabase/utils/errors";
import * as Lib from "metabase-lib";
import {
  fieldValuesToMap,
  getFieldValues,
} from "metabase-lib/v1/queries/utils/field";
import { isEntityName, isFK } from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, FieldValue, Table } from "metabase-types/api";

import type { DraftMapping } from "./CustomMappingModal";
import type { RemappingValue } from "./DisplayValuesPicker";

export { is403Error };

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

  if (hasOnlyMappableNumeralValues(fieldValues)) {
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

// Custom remapping is only offered when every value is numeric (or null) and there's at least one.
function hasOnlyMappableNumeralValues(
  fieldValues: FieldValue[] | undefined,
): boolean {
  const values = getFieldValues({ values: fieldValues });
  return (
    values.length > 0 &&
    values.every(([key]) => typeof key === "number" || key === null)
  );
}

// Seed for the custom-mapping editor: value -> label, labels unset until the admin fills them.
export function getFieldRemappedValues(
  fieldValues: FieldValue[] | undefined,
): DraftMapping {
  return fieldValuesToMap(getFieldValues({ values: fieldValues }));
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
