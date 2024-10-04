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
        {t`A metric is one of the key numbers you want to keep track of`}
      </Text>
      <Text mb="lg" c="text-medium" maw="28.75rem" align="center">
        {t`To create one, you’ll need to define how it’s calculated, add any required filters, and optionally pick the main dimension for your metric.`}
      </Text>
      {isRunnable && (
        <Button variant="filled" onClick={() => runQuestionQuery()}>
          {t`Visualize`}
        </Button>
      )}
    </Flex>
  );
}
