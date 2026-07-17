import type { Location } from "history";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import { useConfirmRouteLeaveModal } from "metabase/common/hooks/use-confirm-route-leave-modal";
import type { Route } from "metabase/router";
import { useRoute, useRouter } from "metabase/router";

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
  // `routes` from the context is typed `PlainRoute[]`; its leaf is the matched
  // route that `setRouteLeaveHook` (a no-op on v7) receives, matching the
  // pre-conversion `Route[]` prop typing.
  const leafRoute = routes[routes.length - 1] as unknown as Route;
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
