import type { Location } from "history";
import type { InjectedRouter, Route } from "react-router";
import { withRouter } from "react-router";

import { useConfirmRouteLeaveModal } from "metabase/common/hooks/use-confirm-route-leave-modal";

import { LeaveConfirmModal } from "./LeaveConfirmModal";

interface LeaveRouteConfirmModalProps {
  isEnabled: boolean;
  isLocationAllowed?: (location?: Location) => boolean;
  route: Route;
  router: InjectedRouter;
  onConfirm?: () => void;
}

const _LeaveRouteConfirmModal = ({
  isEnabled,
  isLocationAllowed,
  route,
  router,
  onConfirm,
}: LeaveRouteConfirmModalProps) => {
  const { opened, close, confirm } = useConfirmRouteLeaveModal({
    isEnabled,
    isLocationAllowed,
    route,
    router,
  });

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

export const LeaveRouteConfirmModal = withRouter(_LeaveRouteConfirmModal);
