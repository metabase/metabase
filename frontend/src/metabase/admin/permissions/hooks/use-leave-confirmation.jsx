import { useEffect, useState } from "react";
import { t } from "ttag";

import Modal from "metabase/components/Modal";
import ConfirmContent from "metabase/components/ConfirmContent";

export const useLeaveConfirmation = ({
  router,
  route,
  onConfirm,
  isEnabled,
}) => {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isConfirmationVisible, setIsConfirmationVisible] = useState(false);
  const [nextLocation, setNextLocation] = useState(null);

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
      onConfirm(nextLocation);
    }
  }, [isConfirmed, onConfirm, nextLocation]);

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
