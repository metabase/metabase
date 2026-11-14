import { t } from "ttag";

import { SettingsSection } from "metabase/data-studio/common/components/SettingsSection";
import { TableStructure } from "metabase/data-studio/data-model/pages/DataModel/TableSection/TableStructure";
import { isRoleA, useTableStructures } from "metabase/metadata/table-structure";
import type { Table } from "metabase-types/api";

/** Connected data's structure settings, editable here too */
export function TableStructureSections({ table }: { table: Table }) {
  const { role } = useTableStructures().getTableStructure(table);
  const isHistoryTable = role != null && isRoleA(role, "role/HistoryDimension");

  return (
    <SettingsSection
      title={t`Structure`}
      description={
        isHistoryTable
          ? t`Its role, what one row is, and the dates each version is true for. These change how queries on this table work.`
          : t`Its role, what one row is, and its main date. These change how queries on this table work.`
      }
    >
      <TableStructure table={table} readOnly={!table.can_write} layout="form" />
    </SettingsSection>
  );
}
