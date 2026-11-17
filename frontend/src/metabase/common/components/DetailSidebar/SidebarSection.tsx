import { Flex, Stack, Title } from "metabase/ui";

import type { SidebarSectionProps } from "./types";

export const SidebarSection = ({
  title,
  titleAside,
  children,
  gap = "lg",
}: SidebarSectionProps) => (
  <Stack gap={gap}>
    <Flex justify="space-between" align="center">
      <Title order={4} fz="md" lh="1rem" fw="bold" c="text-primary">
        {title}
      </Title>
      {titleAside}
    </Flex>
    {children}
  </Stack>
);
