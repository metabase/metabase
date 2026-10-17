import { Stack, Text, Title } from "metabase/ui";

import type { DetailSidebarTitleProps } from "./types";

export const DetailSidebarTitle = ({
  typeLabel,
  title,
}: DetailSidebarTitleProps) => (
  <Stack gap={0}>
    <Text size="sm" c="text-secondary">
      {typeLabel}
    </Text>
    <Title order={3} c="text-primary">
      {title}
    </Title>
  </Stack>
);
