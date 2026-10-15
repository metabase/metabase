import { useGetDashboardCardQueryQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Card, Skeleton, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type {
  DashboardId,
  NormalizedQueryParameter,
  QuestionDashboardCard,
} from "metabase-types/api";

import S from "./UsageStatsCard.module.css";
import { USAGE_STATS_CARD_HEIGHT } from "./constants";

type UsageStatsCardProps = {
  auditDashboardId: DashboardId;
  dashcard: QuestionDashboardCard;
  parameters: NormalizedQueryParameter[];
};

export function UsageStatsCard({
  auditDashboardId,
  dashcard,
  parameters,
}: UsageStatsCardProps) {
  const { currentData: dataset, error } = useGetDashboardCardQueryQuery({
    dashboardId: auditDashboardId,
    dashcardId: dashcard.id,
    cardId: dashcard.card.id,
    parameters,
  });

  if (dataset == null && error == null) {
    return <Skeleton h={USAGE_STATS_CARD_HEIGHT} />;
  }

  return (
    <Card
      className={S.card}
      withBorder
      shadow="none"
      px="xl"
      py="lg"
      h={USAGE_STATS_CARD_HEIGHT}
      data-testid="usage-stats-card"
    >
      <Text fw="bold" mb="lg">
        {dashcard.card.name}
      </Text>
      {dataset != null ? (
        <Visualization
          rawSeries={[{ card: dashcard.card, data: dataset.data }]}
          isDashboard
        />
      ) : (
        <LoadingAndErrorWrapper error={error} />
      )}
    </Card>
  );
}
