import { useDisclosure } from "@mantine/hooks";
import { useCallback, useState } from "react";

import type { TableAction, WritebackAction } from "metabase-types/api";

export const useRowActionEditingModal = () => {
  const [isOpen, { close, open }] = useDisclosure(false);
  const [editingAction, setEditingAction] = useState<
    WritebackAction | TableAction | null
  >(null);

  const enableEditingAction = useCallback(
    (action: WritebackAction | TableAction) => {
      setEditingAction(action);
      open();
    },
    [open],
  );

  const handleCancelEditAction = useCallback(() => {
    close();
    setEditingAction(null);
  }, [close]);

  return {
    isEditingModalOpen: isOpen,
    editingAction,
    openEditingModal: open,

    setEditingAction: enableEditingAction,
    cancelEditAction: handleCancelEditAction,
  };
};
