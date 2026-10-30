import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { EmptyState } from "metabase/common/components/EmptyState";
import { Box, rem } from "metabase/ui";

type ActionFieldEmptyStateProps = {
  readOnly: boolean;
};

export function ActionFieldEmptyState({
  readOnly,
}: ActionFieldEmptyStateProps) {
  return (
    <Box maw={rem(320)} p="xxl">
      <EmptyState
        illustrationElement={<img src={EmptyDashboardBot} alt="" />}
        title={
          readOnly ? t`See the action's fields` : t`Edit the action's fields`
        }
        message={
          readOnly
            ? t`Select a field to see its type, input, default value, and more.`
            : t`Select a field to edit its type, input, default value, and more.`
        }
      />
    </Box>
  );
}
