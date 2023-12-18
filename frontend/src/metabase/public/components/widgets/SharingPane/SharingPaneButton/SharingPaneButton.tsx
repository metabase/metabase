import type { ReactNode } from "react";
import {
  SharingPaneButtonContent,
  SharingPaneButtonTitle,
} from "metabase/public/components/widgets/SharingPane/SharingPaneButton/SharingPaneButton.styled";
import { Box, Center, Stack, Text } from "metabase/ui";

type SharingOptionProps = {
  illustration: JSX.Element;
  children: ReactNode;
  header: string;
  description: ReactNode | string;
  disabled?: boolean;
  onClick?: () => void;
};

export const SharingPaneButton = ({
  illustration,
  children,
  header,
  description,
  disabled,
  onClick,
}: SharingOptionProps) => (
  <SharingPaneButtonContent withBorder>
    <Center h="22.5rem" p="8rem" onClick={onClick}>
      <Stack w="17.5rem" justify="center" align="center">
        {illustration}
        <SharingPaneButtonTitle disabled={disabled}>
          {header}
        </SharingPaneButtonTitle>
        <Text>{description}</Text>
        <Box w="100%">{children}</Box>
      </Stack>
    </Center>
  </SharingPaneButtonContent>
);
