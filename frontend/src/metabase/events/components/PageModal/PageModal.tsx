import React, { ReactNode } from "react";
import Icon from "metabase/components/Icon";
import {
  ModalBody,
  ModalCloseButton,
  ModalHeader,
  ModalRoot,
  ModalTitle,
} from "./PageModal.styled";

export interface PageModalProps {
  title?: string;
  children?: ReactNode;
  onClose?: () => ReactNode;
}

const PageModal = ({
  title,
  children,
  onClose,
}: PageModalProps): JSX.Element => {
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

export default PageModal;
