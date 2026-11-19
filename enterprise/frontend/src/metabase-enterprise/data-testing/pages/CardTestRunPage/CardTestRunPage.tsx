import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useParams } from "metabase/router";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";

import { CardTestHeader } from "../../components/CardTestHeader";
import { DataTestRun } from "../../components/DataTestRun";
import { useRouteCardTest } from "../../hooks/use-route-card-test";

type CardTestRunRouteParams = {
  runId: string;
};

export function CardTestRunPage() {
  const { card, test, isLoading, error } = useRouteCardTest();
  const params = useParams<CardTestRunRouteParams>();
  const runId = Urls.extractEntityId(params.runId);

  if (
    card == null ||
    test == null ||
    runId == null ||
    isLoading ||
    error != null
  ) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="card-test-run">
      <CardTestHeader card={card} test={test} />
      <DataTestRun testType="card" testId={test.id} runId={runId} />
    </PageContainer>
  );
}
