import { t } from "ttag";

import { Button, Flex, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

type MetricEmptyStateProps = {
  query: Lib.Query;
  runQuestionQuery: () => void;
};

export function MetricEmptyState({
  query,
  runQuestionQuery,
}: MetricEmptyStateProps) {
  const canRun = Lib.canRun(query, "metric");

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
        {t`To create one, you’ll need to define how its calculated, add any required filters, and optionally pick the main dimension for your metric.`}
      </Text>
      {canRun && (
        <Button variant="filled" onClick={() => runQuestionQuery()}>
          {t`Visualize`}
        </Button>
      )}
    </Flex>
  );
}
