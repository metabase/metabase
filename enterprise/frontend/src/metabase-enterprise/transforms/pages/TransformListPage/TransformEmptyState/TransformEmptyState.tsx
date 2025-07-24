import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import EmptyState from "metabase/common/components/EmptyState";
import { Box, rem } from "metabase/ui";

import { newTransformUrl } from "../../../utils/urls";

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
            ? t`Transforms allow you to create a table based on your query and refresh it periodically on a schedule`
            : t`Select a transform to edit its query, schedule, and more.`
        }
        action={isListEmptyState && t`Create a transform`}
        link={newTransformUrl()}
      />
    </Box>
  );
}
