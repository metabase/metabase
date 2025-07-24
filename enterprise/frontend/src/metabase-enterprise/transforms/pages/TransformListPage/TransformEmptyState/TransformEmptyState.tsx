import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import EmptyState from "metabase/common/components/EmptyState";
import { Box, rem } from "metabase/ui";

export function TransformEmptyState() {
  return (
    <Box maw={rem(320)} p="xl">
      <EmptyState
        illustrationElement={<img src={EmptyDashboardBot} />}
        title={t`Edit transforms`}
        message={t`Select a transform to edit its query, schedule, and more.`}
      />
    </Box>
  );
}
