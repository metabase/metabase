import { useMemo } from "react";

import { EntityCreationInfo } from "metabase/common/components/EntityCreationInfo";
import {
  OverviewVisualization,
  useCardQueryData,
} from "metabase/data-studio/common/components/OverviewVisualization";
import { DescriptionSection } from "metabase/metrics/components/DescriptionSection";
import { QuerySourceSection } from "metabase/metrics/components/QuerySourceSection";
import { useMetricDefinition } from "metabase/metrics/common/hooks";
import { Flex, Stack } from "metabase/ui";
import {
  TrendInfo,
  useTrendData,
} from "metabase/visualizations/components/TrendInfo";
import * as LibMetric from "metabase-lib/metric";
import type { Card } from "metabase-types/api";

import S from "./MetricAboutSection.module.css";

type MetricAboutSectionProps = {
  card: Card;
};

export function MetricAboutSection({ card }: MetricAboutSectionProps) {
  const { definition } = useMetricDefinition(card.id ?? null);

  const hasTimeDimension = useMemo(
    () =>
      definition
        ? LibMetric.defaultBreakoutDimensions(definition).some(
            LibMetric.isDateOrDateTime,
          )
        : false,
    [definition],
  );

  return (
    <Flex className={S.root} flex={1}>
      <Flex
        direction="column"
        flex={1}
        mah={700}
        className={S.visualizationColumn}
      >
        {hasTimeDimension ? (
          <AboutVisualization card={card} />
        ) : (
          <OverviewVisualization card={card} />
        )}
      </Flex>
      <Stack w={300} ml="lg" gap="lg" className={S.sidebar}>
        <DescriptionSection card={card} />
        <QuerySourceSection card={card} />
        <EntityCreationInfo
          createdAt={card.created_at}
          creator={card.creator}
          lastEditedAt={card["last-edit-info"]?.timestamp}
          lastEditor={card["last-edit-info"]}
        />
      </Stack>
    </Flex>
  );
}

function AboutVisualization({ card }: { card: Card }) {
  const { data, isLoading } = useCardQueryData(card);
  const trendData = useTrendData(data);

  const lineCard = useMemo(
    () => ({ ...card, display: "line" as const }),
    [card],
  );

  return (
    <Stack gap="lg" h="100%">
      {trendData && <TrendInfo {...trendData} />}
      <OverviewVisualization
        card={lineCard}
        data={data}
        isLoading={isLoading}
      />
    </Stack>
  );
}
