import {
  type FactKeyField,
  type PreviousValuePair,
  type ScdTypeResolution,
  inferCurrentTable,
  inferCurrentValueFields,
  inferFactKeyFields,
  inferPreviousValuePairs,
  isRoleA,
  resolveCurrentTableScdType,
  resolveHistoryScdType,
  useSchemaTables,
  useTableStructures,
} from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { Field, Table } from "metabase-types/api";

export type ScdDetails = {
  isHistoryTable: boolean;
  resolution: ScdTypeResolution;
  otherTables: Table[];
  currentTable: Table | undefined;
  currentValueFields: Field[];
  factKeyFields: FactKeyField[];
  previousValuePairs: PreviousValuePair[];
};

export function useScdDetails(
  table: Pick<Table, "db_id" | "id" | "name" | "schema" | "fields">,
): ScdDetails {
  const structure = useTableStructures().getTableStructure(table);
  const { tables } = useSchemaTables(table);
  const fields = table.fields ?? [];
  const overrides = structure.scdDetailsOverrides;
  const isHistoryTable =
    structure.role != null && isRoleA(structure.role, "role/HistoryDimension");

  const otherTables = tables.filter((other) => other.id !== table.id);
  const currentTable =
    overrides.currentTableId !== undefined
      ? otherTables.find((other) => other.id === overrides.currentTableId)
      : inferCurrentTable(table, tables);
  const currentValueFieldIds = overrides.currentValueFieldIds;
  const currentValueFields =
    currentValueFieldIds !== undefined
      ? fields.filter((field) =>
          currentValueFieldIds.includes(getRawTableFieldId(field)),
        )
      : inferCurrentValueFields(fields);
  const durableKeyField = fields.find(
    (field) =>
      getRawTableFieldId(field) === structure.history.durableKeyFieldId,
  );
  const previousValuePairs = inferPreviousValuePairs(fields);

  return {
    isHistoryTable,
    resolution: isHistoryTable
      ? resolveHistoryScdType(structure, { currentValueFields, currentTable })
      : resolveCurrentTableScdType(structure, previousValuePairs),
    otherTables,
    currentTable,
    currentValueFields,
    factKeyFields: inferFactKeyFields(table, durableKeyField, tables),
    previousValuePairs,
  };
}
