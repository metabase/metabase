import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { EmptyState } from "metabase/common/components/EmptyState";
import { Box, rem } from "metabase/ui";

type FieldEmptyStateProps = {
  hasTable: boolean;
};

export function FieldEmptyState({ hasTable }: FieldEmptyStateProps) {
  return (
    <Box maw={rem(320)} p="xl">
      <EmptyState
        illustrationElement={<img src={EmptyDashboardBot} />}
        title={
          hasTable
            ? t`Edit the table and fields`
            : t`Start by selecting data to model`
        }
        message={
          hasTable
            ? t`Select a field to edit its name, description, formatting, and more.`
            : t`Browse your databases to find the table you’d like to edit.`
        }
      />
    </Box>
  );
}
