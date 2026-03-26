import { useMemo } from "react";
import { noop } from "underscore";

import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import type { DimensionItem } from "metabase/metrics-viewer/components/DimensionPillBar";
import { DimensionPillBar } from "metabase/metrics-viewer/components/DimensionPillBar";
import { DISPLAY_TYPE_REGISTRY } from "metabase/metrics-viewer/utils";
import { MetricsViewerClickActionsMode } from "metabase/metrics-viewer/utils/MetricsViewerClickActionsMode";
import { getGridColumns } from "metabase/metrics-viewer/utils/grid-columns";
import { Flex, SimpleGrid, Stack, useElementSize } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { DimensionMetadata } from "metabase-lib/metric";
import type { CardId, SingleSeries } from "metabase-types/api";

import type {
  MetricSourceId,
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
} from "../../types/viewer-state";

import S from "./MetricsViewerVisualization.module.css";

type MetricsViewerVisualizationProps = {
  rawSeries: SingleSeries[];
  dimensionItems: DimensionItem[];
  onDimensionChange?: (
    definitionId: MetricSourceId,
    dimension: DimensionMetadata,
  ) => void;
  onDimensionRemove?: (definitionId: MetricSourceId) => void;
  onBrush?: (range: { start: number; end: number }) => void;
  className?: string;
  definitions: MetricsViewerDefinitionEntry[];
  tab: MetricsViewerTabState;
  onTabUpdate: (updates: Partial<MetricsViewerTabState>) => void;
  cardIdToDimensionId: Record<CardId, MetricSourceId>;
  interactive?: boolean;
};

export function MetricsViewerVisualization({
  rawSeries,
  dimensionItems,
  onDimensionChange,
  onDimensionRemove,
  onBrush,
  className,
  definitions,
  tab,
  onTabUpdate,
  cardIdToDimensionId,
  interactive = true,
}: MetricsViewerVisualizationProps) {
  const { ref, width } = useElementSize();
  const cols = getGridColumns(width, rawSeries.length);

  const clickActionsMode = useMemo(
    () =>
      interactive
        ? new MetricsViewerClickActionsMode({
            definitions,
            tab,
            onTabUpdate,
            cardIdToDimensionId,
          })
        : undefined,
    [cardIdToDimensionId, definitions, interactive, onTabUpdate, tab],
  );

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

      {dimensionItems.length > 0 && onDimensionChange && (
        <DimensionPillBar
          items={dimensionItems}
          onDimensionChange={onDimensionChange}
          onDimensionRemove={onDimensionRemove}
        />
      )}
    </Flex>
  );
}
