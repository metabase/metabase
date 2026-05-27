import type { ReactNode } from "react";

import { Stack, Text } from "metabase/ui";

interface MetricSubSectionProps {
  title: string;
  children: ReactNode;
}

export function MetricSubSection({ title, children }: MetricSubSectionProps) {
  return (
    <Stack gap="xs">
      <Text fw={600} size="sm" c="text-secondary">
        {title}
      </Text>
      {children}
    </Stack>
  );
}
