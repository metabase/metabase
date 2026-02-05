import _ from "underscore";

import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import type { DimensionItem } from "metabase/common/components/DimensionPillBar";
import { DimensionPillBar } from "metabase/common/components/DimensionPillBar";
import { Box, Paper, SimpleGrid, Stack, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type * as Lib from "metabase-lib";
import type { SingleSeries } from "metabase-types/api";

import S from "./SeriesGrid.module.css";

interface ChartCardProps {
  rawSeries: SingleSeries[];
  dimensionItems?: DimensionItem[];
  columnFilter?: (col: Lib.ColumnMetadata) => boolean;
  onDimensionChange?: (
    cardId: string | number,
    newColumn: Lib.ColumnMetadata,
  ) => void;
  showTitle?: boolean;
  label?: string;
}

export function ChartCard({
  rawSeries,
  dimensionItems,
  columnFilter,
  onDimensionChange,
  showTitle,
  label,
}: ChartCardProps) {
  return (
    <Paper withBorder shadow="none" className={S.card}>
      <Stack gap={0} h="100%">
        {label && (
          <Text fw="bold" size="md" truncate="end" px="1rem" pt="sm">
            {label}
          </Text>
        )}
        <Box className={S.chartArea}>
          <DebouncedFrame className={S.chartFrame}>
            <Visualization
              className={S.visualization}
              rawSeries={rawSeries}
              isQueryBuilder={false}
              showTitle={showTitle}
              hideLegend
              handleVisualizationClick={_.noop}
            />
          </DebouncedFrame>
        </Box>
        {dimensionItems && dimensionItems.length > 0 && onDimensionChange && (
          <Box p="sm">
            <DimensionPillBar
              items={dimensionItems}
              columnFilter={columnFilter}
              onDimensionChange={onDimensionChange}
            />
          </Box>
        )}
      </Stack>
    </Paper>
  );
}

interface SeriesGridProps {
  rawSeries: SingleSeries[];
  dimensionItems: DimensionItem[];
  columnFilter?: (col: Lib.ColumnMetadata) => boolean;
  onDimensionChange: (
    cardId: string | number,
    newColumn: Lib.ColumnMetadata,
  ) => void;
}

export function SeriesGrid({
  rawSeries,
  dimensionItems,
  columnFilter,
  onDimensionChange,
}: SeriesGridProps) {
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
      {rawSeries.map((series, index) => {
        const cardId = series.card.id;
        const cardDimensionItems = dimensionItems.filter(
          (item) => item.id === cardId,
        );

        return (
          <ChartCard
            key={cardId ?? index}
            rawSeries={[series]}
            dimensionItems={cardDimensionItems}
            columnFilter={columnFilter}
            onDimensionChange={onDimensionChange}
            showTitle
          />
        );
      })}
    </SimpleGrid>
  );
}
