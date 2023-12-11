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
};

export const SharingPaneButton = ({
  illustration,
  children,
  header,
  description,
  disabled,
}: SharingOptionProps) => {
  return (
    <SharingPaneButtonContent disabled={disabled} withBorder>
      <Center h="22.5rem" p="8rem">
        <Stack w="17.5rem" justify="center" align="center">
          {illustration}
          <SharingPaneButtonTitle>{header}</SharingPaneButtonTitle>
          <Text>{description}</Text>
          <Box w="100%">{children}</Box>
        </Stack>
      </Center>
    </SharingPaneButtonContent>
  );
};
