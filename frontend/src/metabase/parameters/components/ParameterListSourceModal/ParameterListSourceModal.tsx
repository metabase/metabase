import React from "react";
import { t } from "ttag";
import ModalContent from "metabase/components/ModalContent";
import { UiParameter } from "metabase-lib/parameters/types";

export interface ParameterListSourceModalProps {
  parameter: UiParameter;
  onClose?: () => void;
}

const ParameterListSourceModal = ({
  onClose,
}: ParameterListSourceModalProps): JSX.Element => {
  return <ModalContent title={t`Create a custom list`} onClose={onClose} />;
};

export default ParameterListSourceModal;
