import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { Card, Stack, Text } from "metabase/ui";

type ListEmptyStateProps = {
  label: string;
};

export function ListEmptyState({ label }: ListEmptyStateProps) {
  return (
    <Card shadow="none" withBorder>
      <Stack p="xl" align="center">
        <img
          src={EmptyDashboardBot}
          alt={t`Empty dashboard`}
          width={100}
          height={100}
        />
        <Text c="text-secondary">{label}</Text>
      </Stack>
    </Card>
  );
}
