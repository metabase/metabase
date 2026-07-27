import { useEffect } from "react";
import { usePrevious } from "react-use";

import { useConfirmRouteLeaveModal } from "metabase/common/hooks/use-confirm-route-leave-modal";
import {
  type Location,
  type Route,
  useRoute,
  useRouter,
} from "metabase/router";

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
  onConfirm?: () => void;
  onOpenChange?: (opened: boolean) => void;
}

export const LeaveRouteConfirmModal = ({
  isEnabled,
  isLocationAllowed,
  route,
  onConfirm,
  onOpenChange,
}: LeaveRouteConfirmModalProps) => {
  const { router, routes } = useRouter();
  const routeFromContext = useRoute();
  // The matched-route chain's leaf is this page's own route, which
  // `setRouteLeaveHook` (a no-op on v7) receives.
  const leafRoute = routes[routes.length - 1];
  const { opened, close, confirm } = useConfirmRouteLeaveModal({
    isEnabled,
    isLocationAllowed,
    route: route ?? routeFromContext ?? leafRoute,
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
