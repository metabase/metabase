import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { EmptyState } from "metabase/common/components/EmptyState";
import { Box } from "metabase/ui";

type ListEmptyStateProps = {
  label: string;
};

export function ListEmptyState({ label }: ListEmptyStateProps) {
  return (
    <Box p="xl">
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
    </Box>
  );
}
