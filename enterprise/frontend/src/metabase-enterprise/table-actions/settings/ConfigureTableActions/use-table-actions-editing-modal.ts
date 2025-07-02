import { useDisclosure } from "@mantine/hooks";
import { useCallback, useState } from "react";

import type { TableActionDisplaySettings } from "metabase-types/api";

export const useTableActionsEditingModal = () => {
  const [isOpen, { close, open }] = useDisclosure(false);
  const [editingAction, setEditingAction] =
    useState<TableActionDisplaySettings | null>(null);

  const enableEditingAction = useCallback(
    (action: TableActionDisplaySettings) => {
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
