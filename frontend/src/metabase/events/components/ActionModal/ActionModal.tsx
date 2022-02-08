import React, { ReactNode } from "react";
import Icon from "metabase/components/Icon";
import {
  ModalBody,
  ModalCloseButton,
  ModalHeader,
  ModalRoot,
  ModalTitle,
} from "./ActionModal.styled";

export interface ActionModalProps {
  title?: string;
  children?: ReactNode;
  onClose?: () => void;
}

const ActionModal = ({
  title,
  children,
  onClose,
}: ActionModalProps): JSX.Element => {
  return (
    <ModalRoot>
      <ModalHeader>
        <ModalTitle>{title}</ModalTitle>
        <ModalCloseButton onClick={onClose}>
          <Icon name="close" />
        </ModalCloseButton>
      </ModalHeader>
      <ModalBody>{children}</ModalBody>
    </ModalRoot>
  );
};

export default ActionModal;
