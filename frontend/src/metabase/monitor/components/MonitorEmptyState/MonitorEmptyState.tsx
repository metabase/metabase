import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { Stack, Text } from "metabase/ui";

type MonitorEmptyStateProps = {
  label: string;
};

export function MonitorEmptyState({ label }: MonitorEmptyStateProps) {
  return (
    <Stack p="xl" align="center">
      <img
        src={EmptyDashboardBot}
        alt={t`Empty list`}
        width={100}
        height={100}
      />
      <Text c="text-secondary">{label}</Text>
    </Stack>
  );
}
