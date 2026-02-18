import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import type { DimensionItem } from "metabase/common/components/DimensionPillBar";
import { DimensionPillBar } from "metabase/common/components/DimensionPillBar";
import type { MetricsViewerTabLayoutState } from "metabase/metrics-viewer/types";
import type { MetricsViewerClickActionsMode } from "metabase/metrics-viewer/utils/MetricsViewerClickActionsMode";
import { Flex, SimpleGrid, Stack } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { DimensionMetadata } from "metabase-lib/metric";
import type { SingleSeries } from "metabase-types/api";

import S from "./MetricsViewerVisualization.module.css";

const noop = () => {};

type MetricsViewerVisualizationProps = {
  rawSeries: SingleSeries[];
  dimensionItems: DimensionItem[];
  onDimensionChange?: (
    cardId: string | number,
    dimension: DimensionMetadata,
  ) => void;
  onBrush?: (range: { start: number; end: number }) => void;
  className?: string;
  layout?: MetricsViewerTabLayoutState;
  clickActionsMode?: MetricsViewerClickActionsMode;
};

export function MetricsViewerVisualization({
  rawSeries,
  dimensionItems,
  onDimensionChange,
  onBrush,
  className,
  layout,
  clickActionsMode,
}: MetricsViewerVisualizationProps) {
  if (layout?.split === false || !layout || rawSeries.length === 1) {
    return (
      <Flex direction="column" flex="1 0 auto" gap="sm" className={className}>
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
        {dimensionItems.length > 0 && onDimensionChange && (
          <DimensionPillBar
            items={dimensionItems}
            onDimensionChange={onDimensionChange}
          />
        )}
      </Flex>
    );
  } else {
    return (
      <SimpleGrid cols={layout.spacing} flex={1} spacing={0}>
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
                onBrush={onBrush}
                mode={clickActionsMode}
                onChangeCardAndRun={noop}
              />
            </DebouncedFrame>
          </Stack>
        ))}
      </SimpleGrid>
    );
  }
}
