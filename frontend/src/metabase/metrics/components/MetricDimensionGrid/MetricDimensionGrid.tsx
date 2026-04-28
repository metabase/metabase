import { useCallback, useMemo } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { trackMetricPageShowMoreClicked } from "metabase/browse/metrics/analytics";
import { useMetricDimensionQuery } from "metabase/metrics/common/hooks";
import type { DimensionType } from "metabase/metrics/common/utils/dimension-types";
import { useDispatch } from "metabase/redux";
import {
  Button,
  Flex,
  Icon,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import Visualization from "metabase/visualizations/components/Visualization";
import ChartSkeleton from "metabase/visualizations/components/skeletons/ChartSkeleton";
import type { MetricDefinition } from "metabase-lib/metric";
import type {
  Card,
  CardDisplayType,
  Dataset,
  SingleSeries,
} from "metabase-types/api";
import type { MetricId } from "metabase-types/api/metric";

import S from "./MetricDimensionGrid.module.css";
import { useMetricDimensionCards } from "./use-metric-dimension-cards";
import type { DefaultDimension } from "./utils";

type MetricDimensionGridProps = {
  metricId: MetricId;
};

const DEFAULT_SKELETON_COUNT = 3;

const DISPLAY_TYPE_BY_DIMENSION = {
  time: "line",
  geo: "map",
  category: "bar",
  boolean: "bar",
  numeric: "bar",
} as const satisfies Record<DimensionType, CardDisplayType>;

type DimensionDisplayType = (typeof DISPLAY_TYPE_BY_DIMENSION)[DimensionType];

export function MetricDimensionGrid({ metricId }: MetricDimensionGridProps) {
  const { cards, definition, isLoading, hasMore, showMore } =
    useMetricDimensionCards(metricId);

  if (isLoading || !definition) {
    return <DimensionGridSkeleton count={DEFAULT_SKELETON_COUNT} />;
  }

  if (cards.length === 0) {
    return null;
  }

  return (
    <Flex direction="column" gap="lg" flex={1}>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        {cards.map((card) => (
          <MetricDimensionCard
            key={card.dimensionId}
            metricId={metricId}
            definition={definition}
            dimension={card}
            displayType={DISPLAY_TYPE_BY_DIMENSION[card.dimensionType]}
          />
        ))}
      </SimpleGrid>
      {hasMore && (
        <Button
          fullWidth
          leftSection={<Icon name="chevrondown" />}
          onClick={() => {
            trackMetricPageShowMoreClicked(metricId);
            showMore();
          }}
        >
          {t`Show more`}
        </Button>
      )}
    </Flex>
  );
}

interface MetricDimensionCardProps {
  metricId: MetricId;
  definition: MetricDefinition;
  dimension: DefaultDimension;
  displayType: DimensionDisplayType;
}

function MetricDimensionCard({
  metricId,
  definition,
  dimension,
  displayType,
}: MetricDimensionCardProps) {
  const dispatch = useDispatch();
  const { data } = useMetricDimensionQuery(definition, dimension.dimensionId);

  const rawSeries = useMemo(
    () => (data ? buildSingleSeries(data, displayType) : null),
    [data, displayType],
  );

  const handleClick = useCallback(() => {
    dispatch(
      push(
        Urls.exploreMetricDimension({
          metricId,
          dimensionId: dimension.dimensionId,
          dimensionType: dimension.dimensionType,
          displayType,
          label: dimension.label,
        }),
      ),
    );
  }, [dispatch, metricId, dimension, displayType]);

  return (
    <Paper withBorder shadow="none" className={S.card} onClick={handleClick}>
      <Stack h="100%">
        <Text fw="bold" size="md" truncate="end" px="md" pt="sm">
          {t`By ${dimension.label}`}
        </Text>
        <div className={S.chartArea}>
          {rawSeries ? (
            <Visualization
              className={S.visualization}
              rawSeries={rawSeries}
              isQueryBuilder={false}
              hideLegend
              onChangeCardAndRun={_.noop}
              isMetricsViewer
            />
          ) : (
            <ChartSkeleton display={displayType} className={S.visualization} />
          )}
        </div>
      </Stack>
    </Paper>
  );
}

function buildSingleSeries(
  dataset: Dataset,
  displayType: CardDisplayType,
): SingleSeries[] {
  const { cols } = dataset.data;
  const dimensionName = cols[0]?.name;
  const metricName = cols[1]?.name;

  return [
    {
      card: {
        display: displayType,
        visualization_settings: {
          ...(dimensionName ? { "graph.dimensions": [dimensionName] } : {}),
          ...(metricName ? { "graph.metrics": [metricName] } : {}),
        },
      } as Card,
      data: dataset.data,
    },
  ];
}

function DimensionGridSkeleton({ count }: { count: number }) {
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
      {Array.from({ length: count }, (_, index) => (
        <Paper key={index} withBorder shadow="none" className={S.skeletonCard}>
          <ChartSkeleton display="bar" />
        </Paper>
      ))}
    </SimpleGrid>
  );
}
