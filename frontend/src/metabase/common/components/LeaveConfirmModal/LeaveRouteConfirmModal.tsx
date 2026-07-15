import type { Location } from "history";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import { useConfirmRouteLeaveModal } from "metabase/common/hooks/use-confirm-route-leave-modal";
import type { InjectedRouter, Route } from "metabase/router";
import { useRoute, withRouter } from "metabase/router";

import { LeaveConfirmModal } from "./LeaveConfirmModal";

interface LeaveRouteConfirmModalProps {
  isEnabled: boolean;
  isLocationAllowed?: (location?: Location) => boolean;
  /**
   * The route to guard. Omit it on an `element`-based page: the page's own
   * matched route comes from `useRoute()`, so the page does not need the
   * v3-injected `route`. Still accepted for callers that pass it explicitly.
   */
  route?: Route;
  router: InjectedRouter;
  routes: Route[];
  onConfirm?: () => void;
  onOpenChange?: (opened: boolean) => void;
}

const LeaveRouteConfirmModalInner = ({
  isEnabled,
  isLocationAllowed,
  route,
  router,
  routes,
  onConfirm,
  onOpenChange,
}: LeaveRouteConfirmModalProps) => {
  const routeFromContext = useRoute();
  const { opened, close, confirm } = useConfirmRouteLeaveModal({
    isEnabled,
    isLocationAllowed,
    route: route ?? routeFromContext ?? routes[routes.length - 1],
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
