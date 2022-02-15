import React, { ReactNode } from "react";
import Icon from "metabase/components/Icon";
import {
  HeaderActions,
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
      {children && <HeaderActions>{children}</HeaderActions>}
      {onClose && (
        <HeaderCloseButton onClick={onClose}>
          <Icon name="close" />
        </HeaderCloseButton>
      )}
    </HeaderRoot>
  );
};

export default ModalHeader;
