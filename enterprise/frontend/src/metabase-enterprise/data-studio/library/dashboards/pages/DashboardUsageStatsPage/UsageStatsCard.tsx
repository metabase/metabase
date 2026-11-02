import type { ReactNode } from "react";

import { useGetDashboardCardQueryQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { LoadingSkeleton } from "metabase/common/components/Skeletons";
import { Card, Flex, Skeleton, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { getChartSkeletonImage } from "metabase/visualizations/components/skeletons/ChartSkeleton/ChartSkeleton";
import type {
  DashboardId,
  NormalizedQueryParameter,
  QuestionDashboardCard,
  VisualizationDisplay,
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
    return (
      <UsageStatsCardFrame title={<Text fw="bold">{dashcard.card.name}</Text>}>
        <LoadingSkeleton flex={1} mih={0} gap={0}>
          {getChartSkeletonImage(dashcard.card.display)}
        </LoadingSkeleton>
      </UsageStatsCardFrame>
    );
  }

  return (
    <UsageStatsCardFrame
      className={S.card}
      title={<Text fw="bold">{dashcard.card.name}</Text>}
      data-testid="usage-stats-card"
    >
      {dataset != null ? (
        <Visualization
          rawSeries={[{ card: dashcard.card, data: dataset.data }]}
          isDashboard
        />
      ) : (
        <LoadingAndErrorWrapper error={error} />
      )}
    </UsageStatsCardFrame>
  );
}

type UsageStatsCardSkeletonProps = {
  display: VisualizationDisplay;
};

/** Placeholder for a usage stats card whose card hasn't loaded yet. */
export function UsageStatsCardSkeleton({
  display,
}: UsageStatsCardSkeletonProps) {
  return (
    <UsageStatsCardFrame title={<Skeleton h={16} w={200} radius="xs" />}>
      <Flex direction="column" flex={1} mih={0}>
        {getChartSkeletonImage(display)}
      </Flex>
    </UsageStatsCardFrame>
  );
}

type UsageStatsCardFrameProps = {
  title: ReactNode;
  className?: string;
  "data-testid"?: string;
  children: ReactNode;
};

function UsageStatsCardFrame({
  title,
  className,
  "data-testid": dataTestId,
  children,
}: UsageStatsCardFrameProps) {
  return (
    <Card
      className={className}
      withBorder
      shadow="none"
      px="xl"
      py="lg"
      h={USAGE_STATS_CARD_HEIGHT}
      data-testid={dataTestId}
    >
      <Flex mb="lg" mih={22} align="center">
        {title}
      </Flex>
      {children}
    </Card>
  );
}
