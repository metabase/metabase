import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Center, Stack, Text } from "metabase/ui";

type DependencyListEmptyStateProps = {
  label: string;
  isLoading: boolean;
  error: unknown;
};

export function DependencyListEmptyState({
  label,
  isLoading,
  error,
}: DependencyListEmptyStateProps) {
  return (
    <Center flex={1}>
      {isLoading ? (
        <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
      ) : (
        <Stack p="xl" align="center">
          <img
            src={EmptyDashboardBot}
            alt={t`Empty dashboard`}
            width={100}
            height={100}
          />
          <Text c="text-secondary">{label}</Text>
        </Stack>
      )}
    </Center>
  );
}
