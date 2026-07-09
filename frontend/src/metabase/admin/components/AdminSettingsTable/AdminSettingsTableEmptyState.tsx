import type { ReactNode } from "react";

import { Box, Center, Stack, Text } from "metabase/ui";

type AdminSettingsTableEmptyStateProps = {
  message: string;
  illustration?: ReactNode;
};

// TODO: replace with the shared `metabase/common/components/EmptyState` once it's migrated off Emotion (UXW-3641).
export function AdminSettingsTableEmptyState({
  message,
  illustration,
}: AdminSettingsTableEmptyStateProps) {
  return (
    <Center mih="20rem" data-testid="empty-table-warning">
      <Stack align="center" gap="sm">
        {illustration != null && (
          <Box c="text-primary" lh={0}>
            {illustration}
          </Box>
        )}
        <Text c="text-disabled" size="sm" ta="center">
          {message}
        </Text>
      </Stack>
    </Center>
  );
}
