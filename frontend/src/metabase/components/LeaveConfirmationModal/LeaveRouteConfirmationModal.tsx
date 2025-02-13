import type { Location } from "history";
import type { InjectedRouter, Route } from "react-router";
import { withRouter } from "react-router";

import { useConfirmRouteLeaveModal } from "metabase/hooks/use-confirm-route-leave-modal";

import { LeaveConfirmationModal } from "./LeaveConfirmationModal";

interface Props {
  isEnabled: boolean;
  isLocationAllowed?: (location?: Location) => boolean;
  route: Route;
  router: InjectedRouter;
}

const _LeaveRouteConfirmationModal = ({
  isEnabled,
  isLocationAllowed,
  route,
  router,
}: Props) => {
  const { opened, close, confirm } = useConfirmRouteLeaveModal({
    isEnabled,
    isLocationAllowed,
    route,
    router,
  });

  return (
    <LeaveConfirmationModal
      onConfirm={confirm}
      onClose={close}
      opened={opened}
    />
  );
};

export const LeaveRouteConfirmationModal = withRouter(
  _LeaveRouteConfirmationModal,
);
