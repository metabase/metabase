import cx from "classnames";
import type { ReactNode } from "react";
import { c } from "ttag";

import { IconButtonWrapper } from "metabase/common/components/IconButtonWrapper";
import { Box, Ellipsified, Flex, Group, Icon } from "metabase/ui";

import S from "./ModalHeader.module.css";

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

const ModalHeader = ({
  title,
  children,
  onClose,
  onGoBack,
  pathOptions,
}: ModalHeaderProps): JSX.Element => {
  return (
    <Box p="xxl" pb={0}>
      <Flex align="center">
        <Flex
          className={cx(S.headerLink, { [S.clickable]: onGoBack != null })}
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
        {children && <Box mr="lg">{children}</Box>}
        {onClose && (
          <IconButtonWrapper className={S.closeButton} onClick={onClose}>
            <Icon name="close" />
          </IconButtonWrapper>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModalHeader;
