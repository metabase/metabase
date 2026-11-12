import { Flex, Stack, Text, Title } from "metabase/ui";

import type { SidebarSectionProps } from "./types";

export const SidebarSection = ({
  title,
  titleAside,
  description,
  children,
  gap = "lg",
}: SidebarSectionProps) => (
  <Stack gap={gap}>
    <Stack gap="sm">
      <Flex justify="space-between" align="center">
        <Title order={4} fz="md" lh="1rem" fw="bold" c="text-primary">
          {title}
        </Title>
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
