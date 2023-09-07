import { useEffect, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import ConfirmContent from "metabase/components/ConfirmContent";
import Modal from "metabase/components/Modal";
import { useDispatch } from "metabase/lib/redux";

import useBeforeUnload from "./use-before-unload";

export const useLeaveConfirmation = ({ router, route, isEnabled }) => {
  const dispatch = useDispatch();
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isConfirmationVisible, setIsConfirmationVisible] = useState(false);
  const [nextLocation, setNextLocation] = useState(null);

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
