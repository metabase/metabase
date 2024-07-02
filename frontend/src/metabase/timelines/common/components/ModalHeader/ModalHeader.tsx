import type { ReactNode } from "react";

import { Icon } from "metabase/ui";

import {
  HeaderBackIcon,
  HeaderCloseButton,
  HeaderMenu,
  HeaderRoot,
  HeaderTitle,
  HeaderLink,
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
      <HeaderLink onClick={onGoBack}>
        {onGoBack && <HeaderBackIcon name="chevronleft" />}
        <HeaderTitle tooltipMaxWidth="auto">{title}</HeaderTitle>
      </HeaderLink>
      {children && <HeaderMenu>{children}</HeaderMenu>}
      {onClose && (
        <HeaderCloseButton onClick={onClose}>
          <Icon name="close" />
        </HeaderCloseButton>
      )}
    </HeaderRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModalHeader;
