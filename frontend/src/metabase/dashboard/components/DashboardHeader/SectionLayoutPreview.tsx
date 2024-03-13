import { useMemo } from "react";
import _ from "underscore";

import type { SectionLayout } from "metabase/dashboard/sections";
import { Box, Flex } from "metabase/ui";
import type { DashboardCardLayoutAttrs } from "metabase-types/api";

const WIDTH = 70;
const SPACING = 2;
const CELL_WIDTH = 1;
const CELL_HEIGHT = 3;

interface SectionLayoutPreviewProps {
  layout: SectionLayout;
}

export function SectionLayoutPreview({ layout }: SectionLayoutPreviewProps) {
  const layoutItems = useMemo(() => {
    const items = layout.getLayout({ col: 0, row: 0 });
    return items.map((item, index) => {
      // Makes the first "heading" item taller to look better,
      // and moves the rest of the items down
      if (index === 0) {
        return { ...item, size_y: 2 };
      }
      return { ...item, row: item.row + 1 };
    });
  }, [layout]);

  const height = useMemo(() => {
    const maxY = _.max(layoutItems.map(item => item.row + item.size_y));
    return maxY * (CELL_HEIGHT + SPACING);
  }, [layoutItems]);

  return (
    <Flex align="center" justify="center">
      <Box pos="relative" w={WIDTH} mih={height}>
        {layoutItems.map(item => (
          <PreviewCard
            key={item.id}
            layout={item}
            cellWidth={CELL_WIDTH}
            cellHeight={CELL_HEIGHT}
            spacing={SPACING}
          />
        ))}
      </Box>
    </Flex>
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
      bg="white"
      style={{ borderRadius: "2px" }}
    />
  );
}

function calcSize(sizeXY: number, cellSize: number, spacing: number) {
  return sizeXY * cellSize + (sizeXY - 1) * spacing;
}
