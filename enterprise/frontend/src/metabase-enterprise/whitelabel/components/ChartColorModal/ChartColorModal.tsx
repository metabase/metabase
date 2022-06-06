import React, { useCallback } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button/Button";
import ModalContent from "metabase/components/ModalContent";

export interface ChartColorModalProps {
  onReset?: () => void;
  onClose?: () => void;
}

const ChartColorModal = ({
  onReset,
  onClose,
}: ChartColorModalProps): JSX.Element => {
  const handleReset = useCallback(() => {
    onReset?.();
    onClose?.();
  }, [onReset, onClose]);

  return (
    <ModalContent
      title={t`Are you sure you want to reset to default colors?`}
      footer={[
        <Button key="close" onClick={onClose}>
          {t`Cancel`}
        </Button>,
        <Button key="delete" danger onClick={handleReset}>
          {t`Reset`}
        </Button>,
      ]}
      onClose={onClose}
    >
      {t`If you do this, your colors will change to our default colors. This action can’t be undone`}
    </ModalContent>
  );
};

export default ChartColorModal;
