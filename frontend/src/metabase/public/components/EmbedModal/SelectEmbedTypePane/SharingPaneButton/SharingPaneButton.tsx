import type { MouseEvent, MouseEventHandler, ReactNode } from "react";

import { Box, Center, Stack, Text } from "metabase/ui";

import {
  SharingPaneButtonContent,
  SharingPaneButtonTitle,
} from "./SharingPaneButton.styled";

type SharingOptionProps = {
  illustration: JSX.Element;
  children: ReactNode;
  header: string;
  description: ReactNode | string;
  disabled?: boolean;
  onClick?: MouseEventHandler;
  "data-testid"?: string;
};

export const SharingPaneButton = ({
  illustration,
  children,
  header,
  description,
  disabled,
  onClick,
  "data-testid": dataTestId,
}: SharingOptionProps) => (
  <SharingPaneButtonContent
    withBorder
    disabled={disabled}
    data-testid={dataTestId}
  >
    <Center
      h="22.5rem"
      p="8rem"
      onClick={(event: MouseEvent) => !disabled && onClick?.(event)}
    >
      <Stack w="17.5rem" justify="center" align="center">
        {illustration}
        <SharingPaneButtonTitle fz="xl" disabled={disabled}>
          {header}
        </SharingPaneButtonTitle>
        <Text>{description}</Text>
        <Box w="100%">{children}</Box>
      </Stack>
    </Center>
  </SharingPaneButtonContent>
);
