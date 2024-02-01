import type { ReactNode } from "react";
import { useMemo } from "react";
import _ from "underscore";

import type { TooltipProps } from "metabase/ui";
import { Box, Tooltip } from "metabase/ui";
import { GRID_WIDTH } from "metabase/lib/dashboard_grid";
import type { LayoutOption } from "metabase/dashboard/sections";

import type { BaseDashboardCard } from "metabase-types/api";

interface SectionLayoutPreviewTooltipProps extends Omit<TooltipProps, "label"> {
  layout: LayoutOption;
  children: ReactNode;
}

export function SectionLayoutPreviewTooltip({
  layout,
  children,
  ...props
}: SectionLayoutPreviewTooltipProps) {
  const sampleDashcards = useMemo(
    () => layout.getLayout({ col: 0, row: 0 }),
    [layout],
  );

  return (
    <Tooltip {...props} label={<PreviewGrid dashcards={sampleDashcards} />}>
      <span>{children}</span>
    </Tooltip>
  );
}

export function PreviewGrid({ dashcards }: { dashcards: BaseDashboardCard[] }) {
  const previewGridWidth = 160;
  const spacing = 6;

  const cellWidth = Math.max(
    Math.round((previewGridWidth - spacing * (GRID_WIDTH - 1)) / GRID_WIDTH),
    1,
  );

  const cellHeight = 6;

  const previewGridHeight = useMemo(() => {
    const maxY = _.max(dashcards.map(dc => dc.row + dc.size_y));
    return maxY * (cellHeight + spacing);
  }, [dashcards, cellHeight, spacing]);

  return (
    <Box pos="relative" p="sm" w={previewGridWidth} h={previewGridHeight}>
      {dashcards.map(dc => (
        <PreviewCard
          key={dc.id}
          dashcard={dc}
          cellWidth={cellWidth}
          cellHeight={cellHeight}
          spacing={spacing}
        />
      ))}
    </Box>
  );
}

function PreviewCard({
  dashcard,
  cellWidth,
  cellHeight,
  spacing,
}: {
  dashcard: BaseDashboardCard;
  cellWidth: number;
  cellHeight: number;
  spacing: number;
}) {
  const { col, row, size_x, size_y } = dashcard;

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
