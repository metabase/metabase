import type { ReactNode } from "react";
import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { EmptyState } from "metabase/common/components/EmptyState";
import { Box, Stack, Text } from "metabase/ui";

type ListEmptyStateProps = {
  label: string;
  description?: string;
  action?: ReactNode;
};

export function ListEmptyState({
  label,
  description,
  action,
}: ListEmptyStateProps) {
  return (
    <Box p="xxl">
      <EmptyState
        message={label}
        spacing="sm"
        illustrationElement={
          <img
            src={EmptyDashboardBot}
            alt={t`Empty dashboard`}
            width={100}
            height={100}
          />
        }
      />
      {(description != null || action != null) && (
        <Stack align="center" gap="md" mt="xs">
          {description != null && (
            <Text c="text-secondary" ta="center">
              {description}
            </Text>
          )}
          {action}
        </Stack>
      )}
    </Box>
  );
}
