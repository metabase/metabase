import type { ReactNode } from "react";

import { Stack, Text, Title } from "metabase/ui";

type DataTestSectionProps = {
  label: string;
  description: string;
  children: ReactNode;
};

export function DataTestSection({
  label,
  description,
  children,
}: DataTestSectionProps) {
  return (
    <Stack component="section" aria-label={label}>
      <Stack gap="sm">
        <Title order={4}>{label}</Title>
        <Text c="text-secondary">{description}</Text>
      </Stack>
      <Stack gap="md">{children}</Stack>
    </Stack>
  );
}
