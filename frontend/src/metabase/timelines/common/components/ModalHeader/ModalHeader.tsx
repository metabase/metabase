import type { ReactNode } from "react";
import { c } from "ttag";

import { Box, Ellipsified, Flex, Group, Icon } from "metabase/ui";

import {
  HeaderBackIcon,
  HeaderCloseButton,
  HeaderLink,
  HeaderMenu,
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
          <Ellipsified
            tooltipProps={{ w: "auto" }}
            fz="1.25rem"
            lh="1.5rem"
            fw="bold"
          >
            {title}
          </Ellipsified>
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
          <Icon name="folder" c="text-disabled" />
          {pathOptions.collectionName}
        </Group>
      )}
    </Box>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModalHeader;
