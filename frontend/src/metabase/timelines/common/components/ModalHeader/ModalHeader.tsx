import type { ReactNode } from "react";
import { c } from "ttag";

import { Box, Flex, Group, Icon } from "metabase/ui";

import {
  HeaderBackIcon,
  HeaderCloseButton,
  HeaderLink,
  HeaderMenu,
  HeaderTitle,
} from "./ModalHeader.styled";

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
    <Box p="xl" pb={0}>
      <Flex align="center">
        <HeaderLink onClick={onGoBack}>
          {onGoBack && <HeaderBackIcon name="chevronleft" />}
          <HeaderTitle tooltipProps={{ w: "auto" }}>{title}</HeaderTitle>
        </HeaderLink>
        {children && <HeaderMenu>{children}</HeaderMenu>}
        {onClose && (
          <HeaderCloseButton onClick={onClose}>
            <Icon name="close" />
          </HeaderCloseButton>
        )}
      </Flex>
      {pathOptions?.showPath && (
        <Group gap="xs" align="center">
          {c("Refers to: 'Events' in a collection").t`in`}
          <Icon name="folder" c="text-tertiary" />
          {pathOptions.collectionName}
        </Group>
      )}
    </Box>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModalHeader;
