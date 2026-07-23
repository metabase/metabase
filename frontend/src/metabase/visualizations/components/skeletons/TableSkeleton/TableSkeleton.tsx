import { useId } from "react";

import { SkeletonImage } from "./TableSkeleton.styled";

const COLUMN_WIDTHS = [110, 150, 96, 176, 132];
const TILE_WIDTH = COLUMN_WIDTHS.reduce((sum, width) => sum + width, 0);
const COLUMNS = COLUMN_WIDTHS.map((width, index) => ({
  width,
  x: COLUMN_WIDTHS.slice(0, index).reduce((sum, w) => sum + w, 0),
}));

const ROW_HEIGHT = 27;
const HEADER_PILL_HEIGHT = 11;
const HEADER_PILL_RADIUS = 5.5;
const CELL_HEIGHT = 10;
const HEADER_PILL_PADDING = 65;
const CELL_PADDING = 35;

const TableSkeleton = (): JSX.Element => {
  const id = useId();
  const headerPatternId = `table-skeleton-header-${id}`;
  const bodyPatternId = `table-skeleton-body-${id}`;

  return (
    <SkeletonImage xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern
          id={headerPatternId}
          width={TILE_WIDTH}
          height={ROW_HEIGHT}
          patternUnits="userSpaceOnUse"
        >
          {COLUMNS.map(({ x, width }, index) => (
            <rect
              key={index}
              x={x}
              width={width - HEADER_PILL_PADDING}
              height={HEADER_PILL_HEIGHT}
              rx={HEADER_PILL_RADIUS}
              fill="currentColor"
            />
          ))}
        </pattern>
        <pattern
          id={bodyPatternId}
          width={TILE_WIDTH}
          height={ROW_HEIGHT}
          patternUnits="userSpaceOnUse"
        >
          {COLUMNS.map(({ x, width }, index) => (
            <rect
              key={index}
              x={x}
              width={width - CELL_PADDING}
              height={CELL_HEIGHT}
              fill="currentColor"
            />
          ))}
        </pattern>
      </defs>
      <rect
        x="0"
        y="0"
        width="100%"
        height={ROW_HEIGHT}
        fill={`url(#${headerPatternId})`}
      />
      <rect
        x="0"
        y={ROW_HEIGHT}
        width="100%"
        height="100%"
        fill={`url(#${bodyPatternId})`}
      />
    </SkeletonImage>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TableSkeleton;
