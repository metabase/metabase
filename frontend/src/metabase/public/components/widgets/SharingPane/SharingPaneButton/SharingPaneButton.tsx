import type { ReactNode } from "react";
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
  onClick: () => void;
};

export const SharingPaneButton = ({
  illustration,
  children,
  header,
  description,
  disabled,
  onClick,
}: SharingOptionProps) => (
  <SharingPaneButtonContent withBorder disabled={disabled}>
    <Center h="22.5rem" p="8rem" onClick={onClick}>
      <Stack w="17.5rem" justify="center" align="center">
        {illustration}
        <SharingPaneButtonTitle>{header}</SharingPaneButtonTitle>
        <Text>{description}</Text>
        <Box w="100%">{children}</Box>
      </Stack>
    </Center>
  </SharingPaneButtonContent>
);
