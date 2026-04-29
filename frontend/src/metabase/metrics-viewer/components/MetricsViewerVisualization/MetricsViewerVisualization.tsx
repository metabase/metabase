import { useMemo } from "react";
import { noop } from "underscore";

import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DISPLAY_TYPE_REGISTRY } from "metabase/metrics-viewer/utils";
import { MetricsViewerClickActionsMode } from "metabase/metrics-viewer/utils/MetricsViewerClickActionsMode";
import { getGridColumns } from "metabase/metrics-viewer/utils/grid-columns";
import type { MetricSlot } from "metabase/metrics-viewer/utils/metric-slots";
import { Center, Flex, SimpleGrid, Stack, useElementSize } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { CardId, SingleSeries } from "metabase-types/api";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerFormulaEntity,
  MetricsViewerTabState,
} from "../../types/viewer-state";

import S from "./MetricsViewerVisualization.module.css";

type MetricsViewerVisualizationProps = {
  rawSeries: SingleSeries[];
  onBrush?: (range: { start: number; end: number }) => void;
  className?: string;
  definitions: Record<MetricSourceId, MetricsViewerDefinitionEntry>;
  formulaEntities: MetricsViewerFormulaEntity[];
  metricSlots: MetricSlot[];
  tab: MetricsViewerTabState;
  onTabUpdate: (updates: Partial<MetricsViewerTabState>) => void;
  cardIdToEntityIndex: Record<CardId, number>;
  interactive?: boolean;
  queriesAreLoading: boolean;
  queriesError: string | null;
};

export function MetricsViewerVisualization({
  rawSeries,
  onBrush,
  className,
  definitions,
  formulaEntities,
  metricSlots,
  tab,
  onTabUpdate,
  cardIdToEntityIndex,
  interactive = true,
  queriesAreLoading,
  queriesError,
}: MetricsViewerVisualizationProps) {
  const { ref, width } = useElementSize();
  const cols = getGridColumns(width, rawSeries.length);

  const clickActionsMode = useMemo(
    () =>
      interactive
        ? new MetricsViewerClickActionsMode({
            definitions,
            formulaEntities,
            metricSlots,
            tab,
            onTabUpdate,
            cardIdToEntityIndex,
          })
        : undefined,
    [
      definitions,
      cardIdToEntityIndex,
      formulaEntities,
      metricSlots,
      interactive,
      onTabUpdate,
      tab,
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

  return (
    <Flex
      ref={ref}
      direction="column"
      flex="1 0 auto"
      gap="sm"
      className={className}
    >
      {rawSeries.length > 1 &&
      DISPLAY_TYPE_REGISTRY[tab.display].supportsMultipleSeries === false ? (
        <SimpleGrid cols={cols} flex={1} spacing={0}>
          {rawSeries.map((series, i) => (
            <Stack
              gap="sm"
              className={className}
              key={`series-${i}`}
              data-in-grid
            >
              <DebouncedFrame className={S.chartWrapper}>
                <Visualization
                  className={S.chart}
                  rawSeries={[series]}
                  isQueryBuilder={false}
                  hideLegend
                  onBrush={interactive ? onBrush : undefined}
                  mode={clickActionsMode}
                  onChangeCardAndRun={noop}
                  autoAdjustSettings
                  isMetricsViewer
                />
              </DebouncedFrame>
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
            onBrush={interactive ? onBrush : undefined}
            mode={clickActionsMode}
            onChangeCardAndRun={noop}
          />
        </DebouncedFrame>
      )}
    </Flex>
  );
}
