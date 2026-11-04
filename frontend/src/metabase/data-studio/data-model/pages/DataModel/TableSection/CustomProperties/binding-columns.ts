import type { ResolvedEavBinding } from "metabase/metadata/table-structure";
import type { CheckTableRef } from "metabase/metadata/table-structure/generated-checks";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { Field, FieldId, Table } from "metabase-types/api";

export type BindingColumns = {
  entityKey: string;
  property: string;
  value: string;
};

export type BoundEntity = {
  table: CheckTableRef;
  keyColumn: string;
};

export const toTableRef = (
  table: Pick<Table, "schema" | "name">,
): CheckTableRef => ({
  schema: table.schema || null,
  name: table.name,
});

export const getFieldName = (
  fields: Field[] | undefined,
  fieldId: FieldId | null,
) =>
  fields?.find((field) => getRawTableFieldId(field) === fieldId)?.name ?? null;

export function getBindingColumns(
  table: Table,
  { binding }: ResolvedEavBinding,
): BindingColumns | null {
  const entityKey = getFieldName(table.fields, binding.entityKeyFieldId);
  const property = getFieldName(table.fields, binding.propertyFieldId);
  const value = getFieldName(table.fields, binding.valueFieldId);
  if (entityKey == null || property == null || value == null) {
    return null;
  }
  return { entityKey, property, value };
}

export function getBoundEntity({
  entityTable,
  entityKeyField,
}: ResolvedEavBinding): BoundEntity | null {
  const fields = entityTable?.fields ?? [];
  const keyField =
    fields.find(({ id }) => id === entityKeyField?.fk_target_field_id) ??
    fields.find(({ semantic_type }) => semantic_type === "type/PK");
  if (entityTable == null || keyField == null) {
    return null;
  }
  return { table: toTableRef(entityTable), keyColumn: keyField.name };
}
