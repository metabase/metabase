import React, { ReactNode } from "react";
import Icon from "metabase/components/Icon";
import {
  ModalCloseButton,
  ModalHeader,
  ModalMenuButton,
  ModalRoot,
  ModalTitle,
} from "./MenuModal.styled";

export interface MenuModalProps {
  title?: ReactNode;
  menu?: ReactNode;
  children?: ReactNode;
  onClose?: () => void;
}

const MenuModal = ({
  title,
  menu,
  children,
  onClose,
}: MenuModalProps): JSX.Element => {
  return (
    <ModalRoot>
      <ModalHeader>
        <ModalTitle>{title}</ModalTitle>
        {menu && <ModalMenuButton>{menu}</ModalMenuButton>}
        {onClose && (
          <ModalCloseButton onClick={onClose}>
            <Icon name="close" />
          </ModalCloseButton>
        )}
      </ModalHeader>
      {children}
    </ModalRoot>
  );
};

export default MenuModal;
