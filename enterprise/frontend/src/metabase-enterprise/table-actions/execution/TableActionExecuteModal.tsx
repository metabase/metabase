import Modal from "metabase/components/Modal";
import type { SelectedTableActionState } from "metabase/visualizations/types/table-actions";
import type { TableEditingScope } from "metabase-enterprise/data_editing/tables/types";

import { TableActionExecuteModalContent } from "./TableActionExecuteModalContent";

export type TableActionExecuteModalProps = {
  scope: TableEditingScope;
  selectedTableActionState: SelectedTableActionState | null;
  onClose: () => void;
};

export const TableActionExecuteModal = ({
  scope,
  selectedTableActionState,
  onClose,
}: TableActionExecuteModalProps) => {
  return (
    <Modal isOpen={!!selectedTableActionState} onClose={onClose}>
      {selectedTableActionState && (
        <TableActionExecuteModalContent
          scope={scope}
          actionId={selectedTableActionState.actionId}
          initialValues={selectedTableActionState.rowData}
          actionOverrides={selectedTableActionState.actionOverrides}
          onClose={onClose}
        />
      )}
    </Modal>
  );
};
