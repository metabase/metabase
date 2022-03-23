import React, { ReactNode } from "react";
import Icon from "metabase/components/Icon";
import Ellipsified from "metabase/components/Ellipsified";
import {
  HeaderActions,
  HeaderBackButton,
  HeaderCloseButton,
  HeaderRoot,
  HeaderTitle,
} from "./ModalHeader.styled";

export interface ModalHeaderProps {
  title?: ReactNode;
  children?: ReactNode;
  onClose?: () => void;
  onGoBack?: () => void;
}

const ModalHeader = ({
  title,
  children,
  onClose,
  onGoBack,
}: ModalHeaderProps): JSX.Element => {
  return (
    <HeaderRoot>
      {onGoBack && (
        <HeaderBackButton onClick={onGoBack}>
          <Icon name="chevronleft" />
        </HeaderBackButton>
      )}
      <HeaderTitle>
        <Ellipsified tooltipMaxWidth="100%">{title}</Ellipsified>
      </HeaderTitle>
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
