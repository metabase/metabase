import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { Stack, Text } from "metabase/ui";

type DependencyListEmptyStateProps = {
  label: string;
};

export function DependencyListEmptyState({
  label,
}: DependencyListEmptyStateProps) {
  return (
    <Stack p="xl" align="center">
      <img
        src={EmptyDashboardBot}
        alt={t`Empty dashboard`}
        width={100}
        height={100}
      />
      <Text c="text-secondary">{label}</Text>
    </Stack>
  );
}
