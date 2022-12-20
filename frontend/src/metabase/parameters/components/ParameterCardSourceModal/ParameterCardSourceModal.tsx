import React from "react";
import { t } from "ttag";
import ModalContent from "metabase/components/ModalContent";
import { UiParameter } from "metabase-lib/parameters/types";

export interface ParameterCardSourceModalProps {
  parameter: UiParameter;
  onClose?: () => void;
}

const ParameterCardSourceModal = ({
  onClose,
}: ParameterCardSourceModalProps): JSX.Element => {
  return (
    <ModalContent
      title={t`Pick a model or question to use for the values of this widget`}
      onClose={onClose}
    />
  );
};

export default ParameterCardSourceModal;
