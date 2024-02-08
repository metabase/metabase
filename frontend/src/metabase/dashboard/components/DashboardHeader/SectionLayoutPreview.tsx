import { useMemo } from "react";
import _ from "underscore";

import { Box } from "metabase/ui";
import { GRID_WIDTH } from "metabase/lib/dashboard_grid";
import type { SectionLayout } from "metabase/dashboard/sections";

import type { DashboardCardLayoutAttrs } from "metabase-types/api";

const WIDTH = 160;
const SPACING = 6;
const CELL_HEIGHT = 3;

interface SectionLayoutPreviewProps {
  layout: SectionLayout;
}

export function SectionLayoutPreview({ layout }: SectionLayoutPreviewProps) {
  const layoutItems = useMemo(
    () => layout.getLayout({ col: 0, row: 0 }),
    [layout],
  );

  const cellWidth = Math.max(
    Math.round((WIDTH - SPACING * (GRID_WIDTH - 1)) / GRID_WIDTH),
    1,
  );

  const height = useMemo(() => {
    const maxY = _.max(layoutItems.map(item => item.row + item.size_y));
    return maxY * (CELL_HEIGHT + SPACING);
  }, [layoutItems]);

  return (
    <Box pos="relative" p="sm" w={WIDTH} h={height}>
      {layoutItems.map(item => (
        <PreviewCard
          key={item.id}
          layout={item}
          cellWidth={cellWidth}
          cellHeight={CELL_HEIGHT}
          spacing={SPACING}
        />
      ))}
    </Box>
  );
}

interface PreviewCardProps {
  layout: DashboardCardLayoutAttrs;
  cellWidth: number;
  cellHeight: number;
  spacing: number;
}

function PreviewCard({
  layout: { col, row, size_x, size_y },
  cellWidth,
  cellHeight,
  spacing,
}: PreviewCardProps) {
  const width = calcSize(size_x, cellWidth, spacing);
  const height = calcSize(size_y, cellHeight, spacing);

  const top = row * (cellHeight + spacing);
  const left = col * (cellWidth + spacing);

  return (
    <Box
      pos="absolute"
      w={`${width}px`}
      h={`${height}px`}
      top={`${top}px`}
      left={`${left}px`}
      bg="bg-light"
      style={{ borderRadius: "2px" }}
    />
  );
}

function calcSize(sizeXY: number, cellSize: number, spacing: number) {
  return sizeXY * cellSize + (sizeXY - 1) * spacing;
}
