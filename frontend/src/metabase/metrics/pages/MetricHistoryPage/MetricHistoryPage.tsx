import { ActivityTimelineCard } from "metabase/common/data-studio/components/ActivityTimelineCard";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import type {
  MetricPageParams,
  MetricPageProps,
} from "metabase/common/metrics/types";
import { useParams } from "metabase/router";

import { MetricPageCard } from "../../components/MetricPageCard";
import { MetricPageShell } from "../../components/MetricPageShell";
import { metricUrls as defaultUrls } from "../../urls";

export function MetricHistoryPage({
  urls = defaultUrls,
  renderBreadcrumbs,
  showAppSwitcher,
  showDataStudioLink = true,
}: MetricPageProps) {
  const { cardId } = useParams<MetricPageParams>();

  return (
    <MetricPageCard cardId={cardId}>
      {(card) => (
        <PageContainer>
          <MetricPageShell
            card={card}
            urls={urls}
            renderBreadcrumbs={renderBreadcrumbs}
            showAppSwitcher={showAppSwitcher}
            showDataStudioLink={showDataStudioLink}
          />
          <ActivityTimelineCard
            entity="card"
            id={card.id}
            moderationReviews={card.moderation_reviews}
            canWrite={card.can_write}
            data-testid="saved-question-history-list"
          />
        </PageContainer>
      )}
    </MetricPageCard>
  );
}
