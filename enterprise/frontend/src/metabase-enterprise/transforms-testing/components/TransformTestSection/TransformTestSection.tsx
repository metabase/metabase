import type { ReactNode } from "react";

import { Stack, Text, Title } from "metabase/ui";

type TransformTestSectionProps = {
  label: string;
  description: string;
  children: ReactNode;
};

export function TransformTestSection({
  label,
  description,
  children,
}: TransformTestSectionProps) {
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
