import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import type { MetricPageParams } from "metabase/common/metrics/types";
import { MetricPageCard } from "metabase/metrics/components/MetricPageCard";
import { MetricPageShell } from "metabase/metrics/components/MetricPageShell";
import { useParams } from "metabase/router";
import { DataStudioMetricBreadcrumbs } from "metabase-enterprise/data-studio/library/metrics/components/DataStudioMetricBreadcrumbs";
import { dataStudioMetricUrls } from "metabase-enterprise/data-studio/library/metrics/urls";

import { DataTestList } from "../../components/DataTestList";

export function CardTestListPage() {
  const { cardId } = useParams<MetricPageParams>();

  return (
    <MetricPageCard cardId={cardId}>
      {(card) => (
        <PageContainer data-testid="card-test-list">
          <MetricPageShell
            card={card}
            urls={dataStudioMetricUrls}
            showAppSwitcher
            showDataStudioLink={false}
            renderBreadcrumbs={(card) => (
              <DataStudioMetricBreadcrumbs card={card} />
            )}
          />
          <DataTestList testType="card" subjectId={card.id} />
        </PageContainer>
      )}
    </MetricPageCard>
  );
}
