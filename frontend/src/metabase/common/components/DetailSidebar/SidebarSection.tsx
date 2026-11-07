import { Flex, Stack, Text } from "metabase/ui";

import type { SidebarSectionProps } from "./types";

export const SidebarSection = ({
  title,
  titleAside,
  description,
  children,
}: SidebarSectionProps) => (
  <Stack gap="lg">
    <Stack gap="sm">
      <Flex justify="space-between" align="center">
        <Text fw="bold" size="md" lh="1rem" c="text-primary">
          {title}
        </Text>
        {titleAside}
      </Flex>
      {description != null && (
        <Text size="sm" c="text-secondary">
          {description}
        </Text>
      )}
    </Stack>
    {children}
  </Stack>
);
