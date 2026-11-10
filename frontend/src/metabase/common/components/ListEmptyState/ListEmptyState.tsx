import type { ReactNode } from "react";
import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { EmptyState } from "metabase/common/components/EmptyState";
import { Box, Center, Icon, Stack, Text } from "metabase/ui";
import type { IconName } from "metabase-types/api";

type ListEmptyStateProps = {
  label: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Shown large in a gray circle in place of the default illustration */
  icon?: IconName;
};

export function ListEmptyState({
  label,
  description,
  action,
  icon,
}: ListEmptyStateProps) {
  return (
    <Box p="xxl">
      {/* Long explanatory labels wrap into a readable column */}
      <Box maw="30rem" mx="auto">
        <EmptyState
          message={label}
          spacing="sm"
          illustrationElement={
            icon != null ? (
              <Center w={100} h={100} bdrs="50%" bg="background_page-secondary">
                <Icon name={icon} size={40} c="text-secondary" opacity={0.5} />
              </Center>
            ) : (
              <img
                src={EmptyDashboardBot}
                alt={t`Empty dashboard`}
                width={100}
                height={100}
              />
            )
          }
        />
      </Box>
      {(description != null || action != null) && (
        <Stack
          align="center"
          gap="md"
          // A button straight under the label needs more room than text does
          mt={description != null ? "xs" : "lg"}
        >
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
