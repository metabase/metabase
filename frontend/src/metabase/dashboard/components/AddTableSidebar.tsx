import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { Box } from "metabase/ui";
import type { TableId } from "metabase-types/api";

import { TableList } from "./TablePicker/TableList";

interface AddTableSidebarProps {
  onSelect: (cardId: TableId) => void;
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
