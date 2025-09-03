import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";

type UseActionFormUnsavedLeaveConfirmationProps = {
  shouldShowLeaveConfirmation: () => boolean;
  onClose: () => void;
};

export function useActionFormUnsavedLeaveConfirmation({
  shouldShowLeaveConfirmation,
  onClose,
}: UseActionFormUnsavedLeaveConfirmationProps) {
  const [showLeaveConfirmation, leaveConfirmationHandlers] =
    useDisclosure(false);

  const handleClose = useCallback(() => {
    if (shouldShowLeaveConfirmation()) {
      leaveConfirmationHandlers.open();
      return;
    }

    onClose();
  }, [leaveConfirmationHandlers, onClose, shouldShowLeaveConfirmation]);

  const handleLeaveConfirmation = useCallback(() => {
    leaveConfirmationHandlers.close();
    onClose();
  }, [leaveConfirmationHandlers, onClose]);

  return {
    showLeaveConfirmation,
    handleContinue: leaveConfirmationHandlers.close,
    handleClose,
    handleLeaveConfirmation,
  };
}
