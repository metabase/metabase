import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import EmptyState from "metabase/common/components/EmptyState";
import { Box, rem } from "metabase/ui";

type TransformEmptyStateProps = {
  isListEmptyState: boolean;
};

export function TransformEmptyState({
  isListEmptyState,
}: TransformEmptyStateProps) {
  return (
    <Box maw={rem(480)} p="xl">
      <EmptyState
        illustrationElement={<img src={EmptyDashboardBot} />}
        title={
          isListEmptyState
            ? t`Create your first transform`
            : t`Edit a transform`
        }
        message={
          isListEmptyState
            ? t`Transforms allow you to create a table based on a query and refresh it periodically on a schedule`
            : t`Select a transform to edit its query, schedule, and more.`
        }
        action={t`Create a transform`}
        link="/admin/datamodel/transforms/new"
      />
    </Box>
  );
}
