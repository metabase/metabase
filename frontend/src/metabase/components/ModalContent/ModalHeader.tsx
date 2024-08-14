import type { ReactNode } from "react";

import {
  ActionsWrapper,
  HeaderContainer,
  HeaderText,
  HeaderTextContainer,
  ModalContentActionIcon,
  ModalHeaderBackIcon,
} from "./ModalContent.styled";
import type { CommonModalProps } from "./types";

export interface ModalHeaderProps extends CommonModalProps {
  children: ReactNode;

  className?: string;
}

export const ModalHeader = ({
  children,
  className,
  fullPageModal,
  centeredTitle,
  headerActions,
  onClose,
  onBack,
}: ModalHeaderProps) => {
  const hasActions = !!headerActions || !!onClose;
  const actionIconSize = fullPageModal ? 24 : 16;

  return (
    <HeaderContainer className={className} data-testid="modal-header">
      <HeaderTextContainer onClick={onBack}>
        {onBack && <ModalHeaderBackIcon name="chevronleft" />}

        <HeaderText textCentered={fullPageModal || centeredTitle}>
          {children}
        </HeaderText>
      </HeaderTextContainer>

      {hasActions && (
        <ActionsWrapper>
          {headerActions}
          {onClose && (
            <ModalContentActionIcon
              name="close"
              size={actionIconSize}
              onClick={onClose}
            />
          )}
        </ActionsWrapper>
      )}
    </HeaderContainer>
  );
};
