import React, { ReactNode } from "react";
import Icon from "metabase/components/Icon";
import {
  ModalCloseButton,
  ModalHeader,
  ModalMenuButton,
  ModalRoot,
  ModalTitle,
} from "./ActionModal.styled";

export interface ActionModalProps {
  title?: ReactNode;
  menu?: ReactNode;
  children?: ReactNode;
  onClose?: () => void;
}

const ActionModal = ({
  title,
  menu,
  children,
  onClose,
}: ActionModalProps): JSX.Element => {
  return (
    <ModalRoot>
      <ModalHeader>
        <ModalTitle>{title}</ModalTitle>
        {menu && <ModalMenuButton>{menu}</ModalMenuButton>}
        <ModalCloseButton onClick={onClose}>
          <Icon name="close" />
        </ModalCloseButton>
      </ModalHeader>
      {children}
    </ModalRoot>
  );
};

export default ActionModal;
