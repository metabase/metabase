import type { Location } from "history";
import { type ReactNode, useEffect, useState } from "react";
import type { InjectedRouter, Route } from "react-router";
import { withRouter } from "react-router";
import { push } from "react-router-redux";

import Modal from "metabase/components/Modal";
import useBeforeUnload from "metabase/hooks/use-before-unload";
import { useDispatch } from "metabase/lib/redux";

import { LeaveConfirmationModalContent } from "./LeaveConfirmationModalContent";

interface Props {
  isEnabled: boolean;
  isLocationAllowed?: (location?: Location) => boolean;
  route: Route;
  router: InjectedRouter;
  children?: (props: {
    nextLocation: Location | undefined;
    onAction?: () => void;
    onClose?: () => void;
  }) => ReactNode;
}

export const IS_LOCATION_ALLOWED = (location?: Location) => {
  /**
   * If there is no "location" then it's beforeunload event, which is
   * handled by useBeforeUnload hook - no reason to duplicate its work.
   */
  if (!location) {
    return true;
  }

  return false;
};

const LeaveConfirmationModalBase = ({
  isEnabled,
  isLocationAllowed = IS_LOCATION_ALLOWED,
  route,
  router,
  children,
}: Props) => {
  const dispatch = useDispatch();
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isConfirmationVisible, setIsConfirmationVisible] = useState(false);
  const [nextLocation, setNextLocation] = useState<Location>();

  useBeforeUnload(isEnabled);

  useEffect(() => {
    const removeLeaveHook = router.setRouteLeaveHook(route, location => {
      if (isEnabled && !isConfirmed && !isLocationAllowed(location)) {
        setIsConfirmationVisible(true);
        setNextLocation(location);
        return false;
      }
    });

    return removeLeaveHook;
  }, [isLocationAllowed, router, route, isEnabled, isConfirmed]);

  useEffect(() => {
    if (isConfirmed && nextLocation) {
      dispatch(push(nextLocation));
    }
  }, [dispatch, isConfirmed, nextLocation]);

  const handleClose = () => {
    setIsConfirmationVisible(false);
  };

  const handleConfirm = () => {
    setIsConfirmed(true);
  };

  return (
    <Modal isOpen={isConfirmationVisible} zIndex={5}>
      {children ? (
        children({
          nextLocation,
          onAction: handleConfirm,
          onClose: handleClose,
        })
      ) : (
        <LeaveConfirmationModalContent
          onAction={handleConfirm}
          onClose={handleClose}
        />
      )}
    </Modal>
  );
};

export const LeaveConfirmationModal = withRouter(LeaveConfirmationModalBase);
