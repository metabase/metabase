import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Ellipsified, type TreeTableColumnDef } from "metabase/ui";
import type { TableRemapping } from "metabase-types/api";

export function getColumns(): TreeTableColumnDef<TableRemapping>[] {
  return [getFromTableColumn(), getToTableColumn(), getCreatedAtColumn()];
}

function getFromTableColumn(): TreeTableColumnDef<TableRemapping> {
  return {
    id: "from-table",
    header: t`Table`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (remapping) =>
      getQualifiedName(
        remapping.from_db,
        remapping.from_schema,
        remapping.from_table_name,
      ),
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

function getToTableColumn(): TreeTableColumnDef<TableRemapping> {
  return {
    id: "to-table",
    header: t`Mapped table`,
    width: "auto",
    maxAutoWidth: 520,
    accessorFn: (remapping) =>
      getQualifiedName(
        remapping.to_db,
        remapping.to_schema,
        remapping.to_table_name,
      ),
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}

function getCreatedAtColumn(): TreeTableColumnDef<TableRemapping> {
  return {
    id: "created-at",
    header: t`Mapping created at`,
    width: "auto",
    accessorFn: (remapping) => remapping.created_at,
    cell: ({ getValue }) => (
      <DateTime value={String(getValue())} unit="minute" />
    ),
  };
}

export function getQualifiedName(...parts: (string | null)[]): string {
  return parts
    .filter((part): part is string => part != null && part !== "")
    .join("/");
}
