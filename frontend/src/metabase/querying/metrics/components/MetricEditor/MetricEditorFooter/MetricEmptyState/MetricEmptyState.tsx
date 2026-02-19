import { t } from "ttag";

import { Button, Flex, Text } from "metabase/ui";

type MetricEmptyStateProps = {
  isRunnable: boolean;
  runQuestionQuery: () => void;
};

export function MetricEmptyState({
  isRunnable,
  runQuestionQuery,
}: MetricEmptyStateProps) {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      mih="100%"
      data-testid="metric-empty-state"
    >
      <Text mb="sm" fw="bold" fz="lg">
        {t`Create Metrics to define the official way to calculate important numbers for your team`}
      </Text>
      <Text mb="lg" c="text-secondary" maw="30rem" ta="center">
        {t`Metrics are like pre-defined calculations: create your aggregations once, save them as metrics, and use them whenever you need to analyze your data.`}
      </Text>
      {isRunnable && (
        <Button variant="filled" onClick={() => runQuestionQuery()}>
          {t`Visualize`}
        </Button>
      )}
    </Flex>
  );
}
