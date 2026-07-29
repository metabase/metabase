import { useMemo } from "react";
import { t } from "ttag";
import { noop } from "underscore";

import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import { ErrorMessage } from "metabase/common/components/ErrorMessage";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  DimensionPillBar,
  type DimensionPillBarItem,
} from "metabase/metrics-viewer/components/DimensionPillBar";
import type { MetricsViewerDimensionBreakoutState } from "metabase/metrics-viewer/types/viewer-state";
import { DISPLAY_TYPE_REGISTRY } from "metabase/metrics-viewer/utils";
import { MetricsViewerClickActionsMode } from "metabase/metrics-viewer/utils/MetricsViewerClickActionsMode";
import { getGridColumns } from "metabase/metrics-viewer/utils/grid-columns";
import { Center, Flex, SimpleGrid, Stack, useElementSize } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { datasetContainsNoResults } from "metabase-lib/v1/queries/utils/dataset";
import type { CardId } from "metabase-types/api";

import { useMetricsViewerContext } from "../../context";

import S from "./MetricsViewerVisualization.module.css";

type MetricsViewerVisualizationProps = {
  onBrush?: (range: { start: number; end: number }) => void;
  chartColumnLabelsByEntityIndex?: Map<number, DimensionPillBarItem>;
};

export function MetricsViewerVisualization({
  onBrush,
  chartColumnLabelsByEntityIndex,
}: MetricsViewerVisualizationProps) {
  const {
    definitions,
    formulaEntities,
    activeDimensionBreakout: dimensionBreakout,
    queriesAreLoading,
    queriesError,
    metricSlots,
    series: rawSeries,
    cardIdToEntityIndex,
    updateActiveDimensionBreakout,
  } = useMetricsViewerContext();

  const { ref, width } = useElementSize();
  const cols = getGridColumns(width, rawSeries.length);

  const clickActionsMode = useMemo(
    () =>
      dimensionBreakout
        ? new MetricsViewerClickActionsMode({
            definitions,
            formulaEntities,
            metricSlots,
            dimensionBreakout,
            onDimensionBreakoutUpdate: (
              partial: Partial<MetricsViewerDimensionBreakoutState>,
            ) => {
              updateActiveDimensionBreakout((prev) => ({
                ...prev,
                ...partial,
              }));
            },
            cardIdToEntityIndex,
          })
        : undefined,
    [
      definitions,
      cardIdToEntityIndex,
      formulaEntities,
      metricSlots,
      updateActiveDimensionBreakout,
      dimensionBreakout,
    ],
  );

  if (queriesAreLoading || queriesError) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper
          loading={queriesAreLoading}
          error={queriesError}
        />
      </Center>
    );
  }

  if (rawSeries.length === 0) {
    return null;
  }

  const hasNoResults = rawSeries.every((series) =>
    datasetContainsNoResults(series.data),
  );

  if (hasNoResults) {
    return (
      <Center h="100%">
        <ErrorMessage
          type="noRows"
          title={t`No results`}
          message={t`This may be the answer you're looking for. If not, try removing or changing your filters to make them less specific.`}
          action={null}
        />
      </Center>
    );
  }

  if (!dimensionBreakout) {
    return null;
  }

  return (
    <Flex ref={ref} direction="column" flex="1 0 auto" gap="sm">
      {rawSeries.length > 1 &&
      !DISPLAY_TYPE_REGISTRY[dimensionBreakout.display]
        .supportsMultipleSeries ? (
        <SimpleGrid cols={cols} flex={1} spacing={0}>
          {rawSeries.map((series, i) => (
            <Stack
              gap="sm"
              className={S.gridChart}
              key={`series-${i}`}
              data-in-grid
            >
              <DebouncedFrame className={S.chartWrapper}>
                <Visualization
                  className={S.chart}
                  rawSeries={[series]}
                  isQueryBuilder={false}
                  hideLegend
                  onBrush={onBrush}
                  mode={clickActionsMode}
                  onChangeCardAndRun={noop}
                  autoAdjustSettings
                  isMetricsViewer
                />
              </DebouncedFrame>
              <ChartColumnLabel
                cardId={series.card.id}
                cardIdToEntityIndex={cardIdToEntityIndex}
                chartColumnLabelsByEntityIndex={chartColumnLabelsByEntityIndex}
              />
            </Stack>
          ))}
        </SimpleGrid>
      ) : (
        <DebouncedFrame className={S.chartWrapper}>
          <Visualization
            className={S.chart}
            rawSeries={rawSeries}
            isQueryBuilder={false}
            hideLegend
            onBrush={onBrush}
            mode={clickActionsMode}
            onChangeCardAndRun={noop}
          />
        </DebouncedFrame>
      )}
    </Flex>
  );
}

function ChartColumnLabel({
  cardId,
  cardIdToEntityIndex,
  chartColumnLabelsByEntityIndex,
}: {
  cardId: CardId;
  cardIdToEntityIndex: Record<CardId, number>;
  chartColumnLabelsByEntityIndex?: Map<number, DimensionPillBarItem>;
}) {
  const entityIndex = cardIdToEntityIndex[cardId];
  if (entityIndex == null) {
    return null;
  }

  const item = chartColumnLabelsByEntityIndex?.get(entityIndex);

  if (!item?.label) {
    return null;
  }

  return (
    <div className={S.gridChartLabel}>
      <DimensionPillBar items={[item]} textSize="xs" />
    </div>
  );
}
