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
    <Modal isOpen={isConfirmationVisible}>
      <ConfirmContent
        title={t`Discard your unsaved changes?`}
        message={t`If you leave this page now, your changes won't be saved.`}
        confirmButtonText={t`Discard changes`}
        cancelButtonText={t`Cancel`}
        onClose={handleClose}
        onAction={handleConfirm}
      />
    </Modal>
  );
};
