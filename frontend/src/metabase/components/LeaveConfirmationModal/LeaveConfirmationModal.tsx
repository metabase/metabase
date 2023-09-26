import type { Location } from "history";
import { useEffect, useState } from "react";
import type { InjectedRouter, Route } from "react-router";
import { withRouter } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import ConfirmContent from "metabase/components/ConfirmContent";
import Modal from "metabase/components/Modal";
import useBeforeUnload from "metabase/hooks/use-before-unload";
import { useDispatch } from "metabase/lib/redux";

interface Props {
  isEnabled: boolean;
  route: Route;
  router: InjectedRouter;
}

const LeaveConfirmationModalBase = ({ isEnabled, route, router }: Props) => {
  const dispatch = useDispatch();
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isConfirmationVisible, setIsConfirmationVisible] = useState(false);
  const [nextLocation, setNextLocation] = useState<Location>();

  useBeforeUnload(isEnabled);

  useEffect(() => {
    const removeLeaveHook = router.setRouteLeaveHook(route, location => {
      if (isEnabled && !isConfirmed) {
        setIsConfirmationVisible(true);
        setNextLocation(location);
        return false;
      }
    });

    return removeLeaveHook;
  }, [router, route, isEnabled, isConfirmed]);

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
      <ConfirmContent
        title={t`Changes were not saved`}
        message={t`Navigating away from here will cause you to lose any changes you have made.`}
        confirmButtonText={t`Leave anyway`}
        cancelButtonText={t`Cancel`}
        onClose={handleClose}
        onAction={handleConfirm}
      />
    </Modal>
  );
};

export const LeaveConfirmationModal = withRouter(LeaveConfirmationModalBase);
