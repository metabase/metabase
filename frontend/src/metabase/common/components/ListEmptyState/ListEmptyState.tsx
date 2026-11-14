/* eslint-disable @typescript-eslint/no-unsafe-assignment -- FIXME: any-typed values */
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
  /** A smaller circle and icon, for an empty list inside a page */
  isCompact?: boolean;
};

export function ListEmptyState({
  label,
  description,
  action,
  icon,
  isCompact = false,
}: ListEmptyStateProps) {
  return (
    // Compact sits in a list whose empty area already pads it; with that and
    // the list's header, the card comes to 200px
    <Box px={isCompact ? 0 : "xxl"} py={isCompact ? "lg" : "xxl"}>
      {/* Long explanatory labels wrap into a readable column */}
      <Box maw="30rem" mx="auto">
        <EmptyState
          message={label}
          spacing="sm"
          illustrationElement={
            icon != null ? (
              <Center
                w={isCompact ? 64 : 100}
                h={isCompact ? 64 : 100}
                bdrs="50%"
                bg="background_page-secondary"
              >
                <Icon
                  name={icon}
                  size={isCompact ? 24 : 40}
                  c="text-secondary"
                  opacity={0.5}
                />
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
