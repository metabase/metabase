import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Center } from "metabase/ui";

import { CardTestHeader } from "../../components/CardTestHeader";
import { DataTestRun } from "../../components/DataTestRun";
import { useRouteCardTest } from "../../hooks/use-route-card-test";
import { useRouteDataTestRun } from "../../hooks/use-route-data-test-run";

export function CardTestRunPage() {
  const { card, test, isLoading, error } = useRouteCardTest();
  const {
    run,
    isLoading: isLoadingRun,
    error: runError,
  } = useRouteDataTestRun();

  if (
    card == null ||
    test == null ||
    run == null ||
    isLoading ||
    isLoadingRun ||
    error != null
  ) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper
          loading={isLoading || isLoadingRun}
          error={error ?? runError}
        />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="card-test-run">
      <CardTestHeader card={card} test={test} run={run} />
      <DataTestRun testType="card" testId={test.id} runId={run.id} />
    </PageContainer>
  );
}
