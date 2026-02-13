import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import type { DimensionItem } from "metabase/common/components/DimensionPillBar";
import { DimensionPillBar } from "metabase/common/components/DimensionPillBar";
import type { MetricsViewerTabLayoutState } from "metabase/metrics-viewer/types";
import { getNumberOfColumnsFromLayout } from "metabase/metrics-viewer/utils";
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
};

export function MetricsViewerVisualization({
  rawSeries,
  dimensionItems,
  onDimensionChange,
  onBrush,
  className,
  layout,
}: MetricsViewerVisualizationProps) {
  if (layout?.split === false || !layout) {
    return (
      <Flex direction="column" flex="1 0 auto" gap="sm" className={className}>
        <DebouncedFrame className={S.chartWrapper}>
          <Visualization
            className={S.chart}
            rawSeries={rawSeries}
            isQueryBuilder={false}
            hideLegend
            handleVisualizationClick={noop}
            onBrush={onBrush}
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
      <SimpleGrid cols={getNumberOfColumnsFromLayout(layout)} flex={1}>
        {rawSeries.map((series, i) => (
          <Stack gap="sm" className={className} h={300} key={`series-${i}`}>
            <DebouncedFrame className={S.chartWrapper}>
              <Visualization
                className={S.chart}
                rawSeries={[series]}
                isQueryBuilder={false}
                hideLegend
                handleVisualizationClick={noop}
                onBrush={onBrush}
              />
            </DebouncedFrame>
          </Stack>
        ))}
      </SimpleGrid>
    );
  }
}
