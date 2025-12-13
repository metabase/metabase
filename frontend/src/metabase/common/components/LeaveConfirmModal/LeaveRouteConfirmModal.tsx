import type { Location } from "history";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import { useConfirmRouteLeaveModal } from "metabase/common/hooks/use-confirm-route-leave-modal";

import { LeaveConfirmModal } from "./LeaveConfirmModal";

interface LeaveRouteConfirmModalProps {
  isEnabled: boolean;
  isLocationAllowed?: (location?: Location) => boolean;
  onConfirm?: () => void;
  onOpenChange?: (opened: boolean) => void;
}

export const LeaveRouteConfirmModal = ({
  isEnabled,
  isLocationAllowed,
  onConfirm,
  onOpenChange,
}: LeaveRouteConfirmModalProps) => {
  const { opened, close, confirm } = useConfirmRouteLeaveModal({
    isEnabled,
    isLocationAllowed,
  });
  const previousIsOpened = usePrevious(opened);

  useEffect(() => {
    if (previousIsOpened !== opened) {
      onOpenChange?.(opened);
    }
  }, [opened, previousIsOpened, onOpenChange]);

  const handleConfirm = () => {
    confirm();
    onConfirm?.();
  };

  return (
    <LeaveConfirmModal
      onConfirm={handleConfirm}
      onClose={close}
      opened={opened}
    />
  );
};
