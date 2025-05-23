import Modal from "metabase/components/Modal";
import type { SelectedTableActionState } from "metabase/visualizations/types/table-actions";

import { TableActionExecuteModalContent } from "./TableActionExecuteModalContent";

export type TableActionExecuteModalProps = {
  selectedTableActionState: SelectedTableActionState | null;
  onClose: () => void;
};

export const TableActionExecuteModal = ({
  selectedTableActionState,
  onClose,
}: TableActionExecuteModalProps) => {
  return (
    <Modal isOpen={!!selectedTableActionState} onClose={onClose}>
      {selectedTableActionState && (
        <TableActionExecuteModalContent
          actionId={selectedTableActionState.actionId}
          initialValues={selectedTableActionState.rowData}
          actionOverrides={selectedTableActionState.actionOverrides}
          onClose={onClose}
        />
      )}
    </Modal>
  );
};
