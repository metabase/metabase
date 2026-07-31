import { useIntersection } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  DEFAULT_DISPLAY_TYPE_BY_DIMENSION,
  type DefaultDimensionDisplayType,
} from "metabase/common/metrics/utils/dimension-types";
import { trackMetricPageShowMoreClicked } from "metabase/metrics/analytics";
import { useMetricDimensionQuery } from "metabase/metrics/common/hooks";
import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import {
  Button,
  Flex,
  Icon,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import Visualization from "metabase/visualizations/components/Visualization";
import ChartSkeleton from "metabase/visualizations/components/skeletons/ChartSkeleton";
import type { MetricDefinition } from "metabase-lib/metric";
import type {
  Card,
  CardDisplayType,
  Dataset,
  MetricDimension,
  SingleSeries,
} from "metabase-types/api";
import type { MetricId } from "metabase-types/api/metric";

import S from "./MetricDimensionGrid.module.css";
import { useMetricDimensionCards } from "./use-metric-dimension-cards";
import type { OverviewDimension } from "./utils";

type MetricDimensionGridProps = {
  metricId: MetricId;
  dimensions: MetricDimension[];
};

const DEFAULT_SKELETON_COUNT = 3;

export function MetricDimensionGrid({
  metricId,
  dimensions,
}: MetricDimensionGridProps) {
  const {
    cards,
    definition,
    isLoading,
    autoLoad,
    canAutoLoad,
    hasMore,
    showMore,
  } = useMetricDimensionCards(metricId, dimensions);
  const { ref: autoLoadRef, entry } = useIntersection({ threshold: 0.1 });
  const [hasScrollIntent, setHasScrollIntent] = useState(false);

  useEffect(() => {
    setHasScrollIntent(false);
  }, [metricId]);

  useEffect(() => {
    if (!canAutoLoad) {
      return;
    }

    const handleScrollIntent = () => setHasScrollIntent(true);
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY > 0) {
        handleScrollIntent();
      }
    };

    window.addEventListener("scroll", handleScrollIntent, true);
    window.addEventListener("touchmove", handleScrollIntent);
    window.addEventListener("wheel", handleWheel);
    return () => {
      window.removeEventListener("scroll", handleScrollIntent, true);
      window.removeEventListener("touchmove", handleScrollIntent);
      window.removeEventListener("wheel", handleWheel);
    };
  }, [canAutoLoad, metricId]);

  useEffect(() => {
    if (hasScrollIntent && entry?.isIntersecting && canAutoLoad) {
      autoLoad();
    }
  }, [entry?.isIntersecting, autoLoad, canAutoLoad, hasScrollIntent]);

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
            displayType={DEFAULT_DISPLAY_TYPE_BY_DIMENSION[card.dimensionType]}
          />
        ))}
      </SimpleGrid>
      {canAutoLoad && (
        <div
          ref={autoLoadRef}
          className={S.autoLoadTrigger}
          data-testid="metric-dimension-auto-load-trigger"
        />
      )}
      {hasMore && !canAutoLoad && (
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
  dimension: OverviewDimension;
  displayType: DefaultDimensionDisplayType;
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
      // Unjustified type cast. FIXME
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
