import { Box, Flex, Skeleton, Stack } from "metabase/ui";

import S from "./TableSkeleton.module.css";

const DEFAULT_ROWS_COUNT = 8;
const DEFAULT_COLUMNS_COUNT = 5;

interface TableSkeletonProps {
  rowsCount?: number;
  columnsCount?: number;
  /**
   * Relative column widths as fractions (e.g., [0.15, 0.1, 0.12, 0.1, 0.06]).
   * When provided, determines both column count and widths for header and body rows.
   */
  columnWidths?: number[];
  headerHeight?: number;
  rowHeight?: number;
}

export function TableSkeleton({
  rowsCount = DEFAULT_ROWS_COUNT,
  columnsCount = DEFAULT_COLUMNS_COUNT,
  columnWidths,
  headerHeight = 58,
  rowHeight = 48,
}: TableSkeletonProps) {
  const effectiveColumnsCount = columnWidths?.length ?? columnsCount;

  const getWidth = (index: number) => {
    const width = columnWidths?.[index];
    return width != null ? `${width * 100}%` : undefined;
  };

  return (
    <Box
      flex={1}
      mih={0}
      bd="1px solid var(--mb-color-border)"
      bg="bg-white"
      className={S.container}
    >
      <Stack gap={0}>
        <Flex h={headerHeight} px="md" align="center" gap="xl">
          {Array.from({ length: effectiveColumnsCount }).map((_, i) => (
            <Skeleton key={i} h={14} w={getWidth(i)} />
          ))}
        </Flex>
        {Array.from({ length: rowsCount }).map((_, i) => (
          <Flex
            key={i}
            h={rowHeight}
            px="md"
            align="center"
            gap="xl"
            className={S.row}
          >
            {Array.from({ length: effectiveColumnsCount }).map((_, j) => (
              <Skeleton key={j} h={14} w={getWidth(j)} />
            ))}
          </Flex>
        ))}
      </Stack>
    </Box>
  );
}
