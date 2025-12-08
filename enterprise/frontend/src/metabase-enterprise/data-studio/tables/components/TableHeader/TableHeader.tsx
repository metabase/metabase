import type { Table } from "metabase-types/api";

import { PaneHeader } from "../../../common/components/PaneHeader";

import { TableMoreMenu } from "./TableMoreMenu";
import { TableNameInput } from "./TableNameInput";
import { TableTabs } from "./TableTabs";

type TableHeaderProps = {
  table: Table;
};

export function TableHeader({ table }: TableHeaderProps) {
  return (
    <PaneHeader
      data-testid="table-pane-header"
      title={<TableNameInput table={table} />}
      icon="table"
      menu={<TableMoreMenu table={table} />}
      tabs={<TableTabs table={table} />}
    />
  );
}
