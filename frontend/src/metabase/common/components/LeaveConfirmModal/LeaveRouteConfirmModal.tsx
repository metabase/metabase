import type { Location } from "history";
import { useEffect } from "react";
import type { InjectedRouter, Route } from "react-router";
import { withRouter } from "react-router";
import { usePrevious } from "react-use";

import { useConfirmRouteLeaveModal } from "metabase/common/hooks/use-confirm-route-leave-modal";

import { LeaveConfirmModal } from "./LeaveConfirmModal";

interface LeaveRouteConfirmModalProps {
  isEnabled: boolean;
  isLocationAllowed?: (location?: Location) => boolean;
  route: Route;
  router: InjectedRouter;
  onConfirm?: () => void;
  onOpenChange?: (opened: boolean) => void;
}

const LeaveRouteConfirmModalInner = ({
  isEnabled,
  isLocationAllowed,
  route,
  router,
  onConfirm,
  onOpenChange,
}: LeaveRouteConfirmModalProps) => {
  const { opened, close, confirm } = useConfirmRouteLeaveModal({
    isEnabled,
    isLocationAllowed,
    route,
    router,
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

export const LeaveRouteConfirmModal = withRouter(LeaveRouteConfirmModalInner);
