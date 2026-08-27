import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { Stack, Text } from "metabase/ui";

type DiagnosticsEmptyStateProps = {
  label: string;
};

export function DiagnosticsEmptyState({ label }: DiagnosticsEmptyStateProps) {
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
