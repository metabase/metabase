import { Box, Flex, Skeleton, Stack } from "metabase/ui";

import { CHECKBOX_COLUMN_WIDTH, DEFAULT_ROW_HEIGHT } from "../constants";

import S from "./TreeTableSkeleton.module.css";

const DEFAULT_ROWS_COUNT = 8;
const HEADER_HEIGHT = 48;

interface TreeTableSkeletonProps {
  rowsCount?: number;
  showCheckboxes?: boolean;
  columnWidths?: number[];
}

export function TreeTableSkeleton({
  rowsCount = DEFAULT_ROWS_COUNT,
  showCheckboxes = false,
  columnWidths = [0.4, 0.15, 0.1, 0.1],
}: TreeTableSkeletonProps) {
  const getColumnWidth = (index: number) => `${columnWidths[index] * 100}%`;

  return (
    <Stack gap={0} flex={1} mih={0}>
      <Flex h={HEADER_HEIGHT} align="center" className={S.header}>
        {showCheckboxes && (
          <Box w={CHECKBOX_COLUMN_WIDTH} className={S.checkboxColumn} />
        )}
        {columnWidths.map((_, i) => (
          <Flex
            key={i}
            align="center"
            px="sm"
            style={{ width: getColumnWidth(i) }}
          >
            <Skeleton h={12} natural />
          </Flex>
        ))}
      </Flex>
      {Array.from({ length: rowsCount }).map((_, i) => (
        <Flex key={i} h={DEFAULT_ROW_HEIGHT} align="center" className={S.row}>
          {showCheckboxes && (
            <Flex
              w={CHECKBOX_COLUMN_WIDTH}
              justify="center"
              className={S.checkboxColumn}
            >
              <Skeleton h={16} w={16} />
            </Flex>
          )}
          {columnWidths.map((_, j) => (
            <Flex
              key={j}
              align="center"
              px="sm"
              style={{ width: getColumnWidth(j) }}
            >
              <Skeleton h={14} natural />
            </Flex>
          ))}
        </Flex>
      ))}
    </Stack>
  );
}
