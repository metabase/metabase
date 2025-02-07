import cx from "classnames";
import type { ReactNode } from "react";

import { Box, Flex } from "metabase/ui";

import {
  ActionsWrapper,
  ModalContentActionIcon,
  ModalHeaderBackIcon,
} from "./ModalContent.styled";
import S from "./ModalHeader.module.css";
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
    <Flex
      gap="sm"
      align="center"
      p="xl"
      className={cx(S.HeaderContainer, className)}
      data-testid="modal-header"
    >
      <Flex
        align="center"
        w="100%"
        className={cx(S.HeaderTextContainer, {
          [S.clickable]: !!onBack,
        })}
        onClick={onBack}
      >
        {onBack && <ModalHeaderBackIcon name="chevronleft" />}

        <Box
          component="h2"
          w="100%"
          className={cx(S.HeaderText, {
            [S.HeaderTextCentered]: fullPageModal || centeredTitle,
          })}
        >
          <span className={S.HeaderTextContent}>{children}</span>
        </Box>
      </Flex>

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
    </Flex>
  );
};
