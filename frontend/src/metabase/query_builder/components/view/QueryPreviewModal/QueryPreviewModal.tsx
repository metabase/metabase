import React from "react";
import { t } from "ttag";
import QueryPreviewCode from "../QueryPreviewCode";
import {
  ModalBody,
  ModalCloseButton,
  ModalCloseIcon,
  ModalHeader,
  ModalTitle,
} from "./QueryPreviewModal.styled";

export interface QueryPreviewModalProps {
  onClose?: () => void;
}

const QueryPreviewModal = ({
  onClose,
}: QueryPreviewModalProps): JSX.Element => {
  return (
    <div>
      <ModalHeader>
        <ModalTitle>{t`Query preview`}</ModalTitle>
        <ModalCloseButton>
          <ModalCloseIcon name="close" onClick={onClose} />
        </ModalCloseButton>
      </ModalHeader>
      <ModalBody>
        <QueryPreviewCode code="SELECT *" />
      </ModalBody>
    </div>
  );
};

export default QueryPreviewModal;
