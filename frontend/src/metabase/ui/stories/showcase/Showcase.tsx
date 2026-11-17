import type { ReactNode } from "react";

import { Group, Paper, Stack, Text } from "metabase/ui";

import { useStoryTextColor } from "./context";

interface StoryShowcaseProps {
  title: string;
  children: ReactNode;
}

export function StoryShowcase({ title, children }: StoryShowcaseProps) {
  return (
    <Paper withBorder radius="xs" p="xxl" w="fit-content">
      <Stack gap="xxl">
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
      <Text fw="bold" c={useStoryTextColor("primary")}>
        {title}
      </Text>
      {description != null && <StoryLabel>{description}</StoryLabel>}
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
    <Group gap="lg" wrap="nowrap">
      <StoryLabel w={labelWidth}>{label}</StoryLabel>
      {children}
    </Group>
  );
}

interface StoryLabelProps {
  w?: string | number;
  children: ReactNode;
}

/** Secondary caption — row/column labels, section notes. */
export const StoryLabel = ({ w, children }: StoryLabelProps) => (
  <Text size="sm" c={useStoryTextColor("secondary")} w={w}>
    {children}
  </Text>
);
