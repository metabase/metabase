import React, { ReactNode } from "react";
import {
  ModalBody,
  ModalHeader,
  ModalRoot,
  ModalTitle,
} from "./PageModal.styled";

export interface PageModalProps {
  title?: string;
  children?: ReactNode;
}

const PageModal = ({ title, children }: PageModalProps): JSX.Element => {
  return (
    <ModalRoot>
      <ModalHeader>
        <ModalTitle>{title}</ModalTitle>
      </ModalHeader>
      <ModalBody>{children}</ModalBody>
    </ModalRoot>
  );
};

export default PageModal;
