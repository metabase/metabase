import type { ReactNode } from "react";

import { Box, Group, Stack, Text, Title, rem } from "metabase/ui";

/**
 * A list of cards on the Segments and Measures tabs, with an optional title,
 * description, and action above it
 */
export function ListSection({
  title,
  description,
  action,
  isSubheading = false,
  children,
}: {
  title?: string;
  description?: string;
  /** Sits at the end of the title row */
  action?: ReactNode;
  /** Titles in the 17px subheading style, for sections that fill a page */
  isSubheading?: boolean;
  children: ReactNode;
}) {
  const hasHeader = title != null || description != null || action != null;
  return (
    <Stack gap="sm">
      {hasHeader && (
        <Stack gap={isSubheading ? "sm" : 0}>
          {/* The title and its action share a row; the description runs below both */}
          <Group justify="space-between" align="center" wrap="nowrap" gap="md">
            {title &&
              (isSubheading ? (
                <Title order={4}>{title}</Title>
              ) : (
                <Text fw="bold">{title}</Text>
              ))}
            {action && <Box flex="0 0 auto">{action}</Box>}
          </Group>
          {description && (
            <Text size="sm" c="text-secondary">
              {description}
            </Text>
          )}
        </Stack>
      )}
      <Stack gap={rem(12)} role="list">
        {children}
      </Stack>
    </Stack>
  );
}
