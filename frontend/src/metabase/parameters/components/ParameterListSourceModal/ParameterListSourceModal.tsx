import React from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import ModalContent from "metabase/components/ModalContent";
import { UiParameter } from "metabase-lib/parameters/types";
import { ModalMessage, ModalTextArea } from "./ParameterListSourceModal.styled";

export interface ParameterListSourceModalProps {
  parameter: UiParameter;
  onClose?: () => void;
}

const ParameterListSourceModal = ({
  onClose,
}: ParameterListSourceModalProps): JSX.Element => {
  return (
    <ModalContent
      title={t`Create a custom list`}
      footer={[
        <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
        <Button key="submit" primary onClick={onClose}>{t`Done`}</Button>,
      ]}
      onClose={onClose}
    >
      <div>
        <ModalMessage>{t`Enter one value per line.`}</ModalMessage>
        <ModalTextArea fullWidth />
      </div>
    </ModalContent>
  );
};

export default ParameterListSourceModal;
