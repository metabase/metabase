import cx from "classnames";
import type { ReactNode } from "react";
import { c, t } from "ttag";

import CS from "metabase/css/core/index.css";
import { ActionIcon, Box, Ellipsified, Flex, Group, Icon } from "metabase/ui";

export interface ModalHeaderProps {
  title?: ReactNode;
  children?: ReactNode;
  onClose?: () => void;
  onGoBack?: () => void;
  pathOptions?: {
    showPath: boolean;
    collectionName: string;
  };
}

export const ModalHeader = ({
  title,
  children,
  onClose,
  onGoBack,
  pathOptions,
}: ModalHeaderProps): JSX.Element => {
  const canGoBack = onGoBack !== undefined;

  return (
    <Box p="xxl" pb={0}>
      <Flex align="center">
        <Flex
          className={cx(CS.textDefault, {
            [CS.cursorPointer]: canGoBack,
            [CS.textBrandHover]: canGoBack,
          })}
          align="center"
          miw={0}
          mr="auto"
          onClick={onGoBack}
        >
          {onGoBack && <Icon name="chevronleft" mr="sm" />}
          <Ellipsified
            tooltipProps={{ w: "auto" }}
            fz="1.25rem"
            lh="1.5rem"
            fw="bold"
          >
            {title}
          </Ellipsified>
        </Flex>
        {children}
        {onClose && (
          <ActionIcon variant="subtle" onClick={onClose} aria-label={t`Close`}>
            <Icon name="close" />
          </ActionIcon>
        )}
      </Flex>
      {pathOptions?.showPath && (
        <Group gap="xxs" align="center">
          {c("Refers to: 'Events' in a collection").t`in`}
          <Icon name="folder" c="text-disabled" />
          {pathOptions.collectionName}
        </Group>
      )}
    </Box>
  );
};
