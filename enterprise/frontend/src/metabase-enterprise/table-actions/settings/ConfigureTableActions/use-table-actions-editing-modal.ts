import { useDisclosure } from "@mantine/hooks";
import { useCallback, useState } from "react";

import type { WritebackAction } from "metabase-types/api";

export const useTableActionsEditingModal = () => {
  const [isOpen, { close, open }] = useDisclosure(false);
  const [editingAction, setEditingAction] = useState<WritebackAction | null>(
    null,
  );

  const enableEditingAction = useCallback(
    (action: WritebackAction) => {
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
