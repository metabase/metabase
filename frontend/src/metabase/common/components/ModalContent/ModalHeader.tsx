import cx from "classnames";
import type { ReactNode } from "react";
import { t } from "ttag";

import type { IconProps, MantineStyleProps } from "metabase/ui";
import { Flex, Icon, Title, UnstyledButton } from "metabase/ui";

import S from "./ModalHeader.module.css";
import type { CommonModalProps } from "./types";

export const ModalContentActionIcon = ({ className, ...props }: IconProps) => (
  <Icon {...props} className={cx(S.actionIcon, className)} />
);

export interface ModalHeaderProps extends CommonModalProps {
  children: ReactNode;

  className?: string;
  py?: MantineStyleProps["py"];
}

export const ModalHeader = ({
  children,
  className,
  py = "xl",
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
      px="xl"
      py={py}
      flex="0 0 auto"
      className={className}
      data-testid="modal-header"
    >
      <Flex
        align="center"
        gap="sm"
        flex="1 1 auto"
        className={cx(S.HeaderTextContainer, {
          [S.clickable]: !!onBack,
        })}
        onClick={onBack}
      >
        {onBack && (
          <UnstyledButton
            display="flex"
            flex="0 0 auto"
            className={S.backButton}
            aria-label={t`Back`}
            onClick={(event) => {
              // the container's onClick also calls onBack; don't fire it twice
              event.stopPropagation();
              onBack();
            }}
          >
            <Icon name="chevronleft" />
          </UnstyledButton>
        )}

        <Title
          order={3}
          w="100%"
          flex="1 1 auto"
          className={cx(S.HeaderText, {
            [S.HeaderTextCentered]: fullPageModal || centeredTitle,
          })}
        >
          <span className={S.HeaderTextContent}>{children}</span>
        </Title>
      </Flex>

      {hasActions && (
        <Flex gap="sm">
          {headerActions}
          {onClose && (
            <ModalContentActionIcon
              name="close"
              size={actionIconSize}
              onClick={onClose}
            />
          )}
        </Flex>
      )}
    </Flex>
  );
};
