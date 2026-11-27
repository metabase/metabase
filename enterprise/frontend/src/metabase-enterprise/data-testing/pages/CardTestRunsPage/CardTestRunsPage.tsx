import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Center } from "metabase/ui";

import { CardTestHeader } from "../../components/CardTestHeader";
import { DataTestRuns } from "../../components/DataTestRuns";
import { useRouteCardTest } from "../../hooks/use-route-card-test";

export function CardTestRunsPage() {
  const { card, test, isLoading, error } = useRouteCardTest();

  if (card == null || test == null || isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="card-test-runs">
      <CardTestHeader card={card} test={test} />
      <DataTestRuns testType="card" testId={test.id} />
    </PageContainer>
  );
}
