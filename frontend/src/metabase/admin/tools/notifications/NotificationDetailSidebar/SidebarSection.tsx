import { Flex, Stack, Text } from "metabase/ui";

import type { SidebarSectionProps } from "./types";

export const SidebarSection = ({
  title,
  titleAside,
  children,
}: SidebarSectionProps) => (
  <Stack gap="md">
    <Flex justify="space-between" align="center">
      <Text fw="bold" size="md" lh="1rem" c="text-primary">
        {title}
      </Text>
      {titleAside}
    </Flex>
    {children}
  </Stack>
);
