import React, { ReactNode } from "react";
import Icon from "metabase/components/Icon";
import {
  ModalBody,
  ModalCloseButton,
  ModalHeader,
  ModalRoot,
  ModalTitle,
} from "./EventModal.styled";

export interface EventModalProps {
  title?: string;
  children?: ReactNode;
  onClose?: () => ReactNode;
}

const EventModal = ({
  title,
  children,
  onClose,
}: EventModalProps): JSX.Element => {
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

export default EventModal;
