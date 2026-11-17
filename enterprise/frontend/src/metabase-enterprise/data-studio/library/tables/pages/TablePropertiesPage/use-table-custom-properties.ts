import { useCustomPropertyValueTable } from "metabase/data-studio/data-model/pages/DataModel/TableSection/CustomProperties/EntityCustomPropertiesSection";
import { isRoleA, useTableStructures } from "metabase/metadata/table-structure";
import type { Table } from "metabase-types/api";

/**
 * How a table relates to custom properties: it `stores` them (a custom
 * property table), it `has` them (another table stores its records'), or
 * `null` for neither. A table's own role is known at once; whether another
 * table stores its records' properties waits on its schema's tables.
 */
export function useTableCustomProperties(table: Table) {
  const { role } = useTableStructures().getTableStructure(table);
  const { valueTable, isLoading } = useCustomPropertyValueTable(table);
  const isStore = role != null && isRoleA(role, "role/CustomPropertyTable");
  const kind = isStore ? "stores" : valueTable != null ? "has" : null;
  return { kind, isLoading: !isStore && isLoading };
}
