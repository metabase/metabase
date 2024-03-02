import { useCallback } from "react";
import { t } from "ttag";

import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button/Button";

export interface ColorResetModalProps {
  onReset?: () => void;
  onClose?: () => void;
}

const ColorResetModal = ({
  onReset,
  onClose,
}: ColorResetModalProps): JSX.Element => {
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
      {t`If you do this, your colors will change to our default colors. This action can’t be undone.`}
    </ModalContent>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ColorResetModal;
