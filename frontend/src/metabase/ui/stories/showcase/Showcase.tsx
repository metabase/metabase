import type { ReactNode } from "react";

import { Group, Paper, Stack, Text } from "metabase/ui";

interface StoryShowcaseProps {
  title: string;
  children: ReactNode;
}

export function StoryShowcase({ title, children }: StoryShowcaseProps) {
  return (
    <Paper withBorder radius="sm" p="xl" w="fit-content">
      <Stack gap="xl">
        <Text fz="1.5rem" fw="bold" c="text-primary">
          {title}
        </Text>
        {children}
      </Stack>
    </Paper>
  );
}

interface StorySectionProps {
  title: string;
  /** Optional line under the title — e.g. a note about defaults. */
  description?: ReactNode;
  children: ReactNode;
}

export function StorySection({
  title,
  description,
  children,
}: StorySectionProps) {
  return (
    <Stack gap="sm">
      <Text fw="bold" c="text-primary">
        {title}
      </Text>
      {description != null && (
        <Text size="sm" c="text-secondary">
          {description}
        </Text>
      )}
      {children}
    </Stack>
  );
}

interface StoryRowProps {
  label: ReactNode;
  /** Width of the label column, so rows line up. */
  labelWidth?: string | number;
  children: ReactNode;
}

export function StoryRow({
  label,
  labelWidth = "9rem",
  children,
}: StoryRowProps) {
  return (
    <Group gap="md" wrap="nowrap">
      <Text size="sm" c="text-secondary" w={labelWidth}>
        {label}
      </Text>
      {children}
    </Group>
  );
}
