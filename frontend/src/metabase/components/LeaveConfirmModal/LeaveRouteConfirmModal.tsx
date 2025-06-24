import type { Location } from "history";
import type { InjectedRouter, Route } from "react-router";
import { withRouter } from "react-router";

import { useConfirmRouteLeaveModal } from "metabase/hooks/use-confirm-route-leave-modal";

import { LeaveConfirmModal } from "./LeaveConfirmModal";

interface LeaveRouteConfirmModalProps {
  isEnabled: boolean;
  isLocationAllowed?: (location?: Location) => boolean;
  route: Route;
  router: InjectedRouter;
}

const _LeaveRouteConfirmModal = ({
  isEnabled,
  isLocationAllowed,
  route,
  router,
}: LeaveRouteConfirmModalProps) => {
  const { opened, close, confirm } = useConfirmRouteLeaveModal({
    isEnabled,
    isLocationAllowed,
    route,
    router,
  });

  return (
    <LeaveConfirmModal onConfirm={confirm} onClose={close} opened={opened} />
  );
};

export const LeaveRouteConfirmModal = withRouter(_LeaveRouteConfirmModal);
