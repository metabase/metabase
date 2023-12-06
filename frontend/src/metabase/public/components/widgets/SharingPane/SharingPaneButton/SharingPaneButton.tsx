import type { ReactNode } from "react";
import { useHover } from "react-use";
import {
  SharingPaneButtonContent,
  SharingPaneButtonTitle,
} from "metabase/public/components/widgets/SharingPane/SharingPaneButton/SharingPaneButton.styled";
import { Box, Center, Stack, Text } from "metabase/ui";
import type { SharingPaneIconProps } from "../icons/types";

type SharingOptionProps = {
  illustration: (props: SharingPaneIconProps) => JSX.Element;
  children: ReactNode;
  header: string;
  description: ReactNode | string;
  disabled?: boolean;
};

export const SharingPaneButton = ({
  illustration: Illustration,
  children,
  header,
  description,
  disabled,
}: SharingOptionProps) => {
  const contentElement = (isHovered: boolean) => (
    <SharingPaneButtonContent disabled={disabled} withBorder>
      <Center h="22.5rem" p="8rem">
        <Stack w="17.5rem" justify="center" align="center">
          <Illustration hovered={isHovered} disabled={disabled} />
          <SharingPaneButtonTitle>{header}</SharingPaneButtonTitle>
          <Text>{description}</Text>
          <Box w="100%">{children}</Box>
        </Stack>
      </Center>
    </SharingPaneButtonContent>
  );

  const [element] = useHover(contentElement);

  return element;
};
