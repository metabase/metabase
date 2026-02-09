import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import type { DimensionItem } from "metabase/common/components/DimensionPillBar";
import { DimensionPillBar } from "metabase/common/components/DimensionPillBar";
import { Flex } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { SingleSeries } from "metabase-types/api";

import S from "./MetricsViewerVisualization.module.css";

const noop = () => {};

type MetricsViewerVisualizationProps = {
  rawSeries: SingleSeries[];
  dimensionItems: DimensionItem[];
  onDimensionChange?: (
    cardId: string | number,
    optionName: string,
  ) => void;
  onBrush?: (range: { start: number; end: number }) => void;
  className?: string;
};

export function MetricsViewerVisualization({
  rawSeries,
  dimensionItems,
  onDimensionChange,
  onBrush,
  className,
}: MetricsViewerVisualizationProps) {
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
}
