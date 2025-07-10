import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { Box } from "metabase/ui";
import type { DatabaseId, TableId } from "metabase-types/api";

import { TableList } from "./TablePicker/TableList";

interface AddTableSidebarProps {
  onSelect: ({
    tableId,
    databaseId,
  }: {
    tableId: TableId;
    databaseId: DatabaseId;
  }) => void;
  onClose: () => void;
}

export function AddTableSidebar(props: AddTableSidebarProps) {
  return (
    <Sidebar data-testid="add-table-sidebar">
      <Box p="md">
        <TableList onSelect={props.onSelect} />
      </Box>
    </Sidebar>
  );
}
