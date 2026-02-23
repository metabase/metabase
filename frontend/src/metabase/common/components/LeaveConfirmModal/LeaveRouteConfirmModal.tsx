import type { Location } from "history";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import { useBlockNavigation } from "metabase/routing";

import { LeaveConfirmModal } from "./LeaveConfirmModal";

interface LeaveRouteConfirmModalProps {
  isEnabled: boolean;
  isLocationAllowed?: (location?: Location) => boolean;
  onConfirm?: () => void;
  onOpenChange?: (opened: boolean) => void;
}

/**
 * Modal that confirms navigation away from the current route when there are
 * unsaved changes.
 *
 * Uses useBlockNavigation which automatically obtains router/route from context.
 */
export const LeaveRouteConfirmModal = ({
  isEnabled,
  isLocationAllowed,
  onConfirm,
  onOpenChange,
}: LeaveRouteConfirmModalProps) => {
  const { isBlocked, cancel, proceed } = useBlockNavigation({
    isEnabled,
    isLocationAllowed,
  });
  const previousIsOpened = usePrevious(isBlocked);

  useEffect(() => {
    if (previousIsOpened !== isBlocked) {
      onOpenChange?.(isBlocked);
    }
  }, [isBlocked, previousIsOpened, onOpenChange]);

  const handleConfirm = () => {
    proceed();
    onConfirm?.();
  };

  return (
    <LeaveConfirmModal
      onConfirm={handleConfirm}
      onClose={cancel}
      opened={isBlocked}
    />
  );
};
