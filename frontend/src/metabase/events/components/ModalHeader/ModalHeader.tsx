import React, { ReactNode } from "react";
import Icon from "metabase/components/Icon";
import {
  HeaderCloseButton,
  HeaderRoot,
  HeaderTitle,
} from "./ModalHeader.styled";

export interface ModalHeaderProps {
  title?: ReactNode;
  children?: ReactNode;
  onClose?: () => void;
}

const ModalHeader = ({
  title,
  children,
  onClose,
}: ModalHeaderProps): JSX.Element => {
  return (
    <HeaderRoot>
      <HeaderTitle>{title}</HeaderTitle>
      {children}
      {onClose && (
        <HeaderCloseButton onClick={onClose}>
          <Icon name="close" />
        </HeaderCloseButton>
      )}
    </HeaderRoot>
  );
};

export default ModalHeader;
