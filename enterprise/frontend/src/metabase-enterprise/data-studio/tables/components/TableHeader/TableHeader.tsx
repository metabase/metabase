import type { Table } from "metabase-types/api";

import { PaneHeader } from "../../../common/components/PaneHeader";

import { TableNameInput } from "./TableNameInput";
import { TableTabs } from "./TableTabs";

type TableHeaderProps = {
  table: Table;
};

export function TableHeader({ table }: TableHeaderProps) {
  return (
    <PaneHeader
      data-testid="table-header"
      title={<TableNameInput table={table} />}
      icon="table"
      tabs={<TableTabs table={table} />}
    />
  );
}
