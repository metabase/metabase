import type { ReactNode } from "react";
import { t } from "ttag";

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
  collectionName: string;
  showPath: boolean;
}

const ModalHeader = ({
  title,
  children,
  onClose,
  onGoBack,
  collectionName,
  showPath,
}: ModalHeaderProps): JSX.Element => {
  return (
    <Box p="xl" pb={0}>
      <Flex align="center">
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
      </Flex>
      {showPath && (
        <Group gap="xs" align="center">
          {t`in`}
          <Icon name="folder" c="text-light" />
          {collectionName}
        </Group>
      )}
    </Box>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModalHeader;
