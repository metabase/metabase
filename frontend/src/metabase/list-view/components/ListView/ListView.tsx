import { type CSSProperties, useMemo } from "react";
import { t } from "ttag";

import { VirtualizedList } from "metabase/common/components/VirtualizedList";
import { formatValue } from "metabase/lib/formatting";
import { Box, Flex, Icon, Image, Stack, Text } from "metabase/ui";
import { useObjectDetail } from "metabase/visualizations/components/TableInteractive/hooks/use-object-detail";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type { DatasetColumn, DatasetData } from "metabase-types/api";

import styles from "./ListView.module.css";

const ListWrapper = ({ children, ...props }: { children: React.ReactNode }) => (
  <Stack className={styles.listBody} {...props}>
    {children}
  </Stack>
);

export interface ListViewProps {
  data: DatasetData;
  settings: ComputedVisualizationSettings;
  sortedColumnName?: string;
  sortingDirection?: "asc" | "desc";
  onSortClick: (column: DatasetColumn) => void;
}

export function ListView({
  data,
  settings,
  sortedColumnName,
  sortingDirection,
  onSortClick,
}: ListViewProps) {
  const { cols, rows } = data;

  const { titleColumn, subtitleColumn, imageColumn, rightColumns } =
    useListColumns(cols);

  const openObjectDetail = useObjectDetail(data);

  return (
    <Stack
      className={styles.listViewContainer}
      style={{ "--grid-columns": rightColumns.length }}
    >
      <Stack className={styles.listContainer}>
        <Flex className={styles.listHeader}>
          <Flex align="center" gap="md" style={{ flexShrink: 0 }}>
            {!!titleColumn && (
              <ColumnHeader
                column={titleColumn}
                subtitleColumn={subtitleColumn}
                sortedColumnName={sortedColumnName}
                sortingDirection={sortingDirection}
                onSortClick={onSortClick}
              />
            )}
          </Flex>

          {rightColumns.map((col, colIndex) => (
            <ColumnHeader
              key={colIndex}
              column={col}
              sortedColumnName={sortedColumnName}
              sortingDirection={sortingDirection}
              onSortClick={onSortClick}
              style={{
                flexShrink: 0,
              }}
            />
          ))}
        </Flex>

        <VirtualizedList Wrapper={ListWrapper} estimatedItemSize={74}>
          {rows.map((row, rowIndex) => {
            return (
              <Box
                key={rowIndex}
                className={styles.listItem}
                onClick={() => openObjectDetail(rowIndex)}
              >
                <Flex align="center" gap="md" style={{ flexShrink: 0 }}>
                  {imageColumn && (
                    <Image
                      src={row[cols.indexOf(imageColumn)]}
                      alt=""
                      w={32}
                      h={32}
                      radius="xl"
                      style={{ flexShrink: 0 }}
                    />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {titleColumn && (
                      <Text
                        fw="bold"
                        truncate
                        style={{ color: "var(--mb-color-brand)" }}
                      >
                        {formatValue(row[cols.indexOf(titleColumn)], {
                          ...(settings.column?.(titleColumn) || {}),
                          jsx: true,
                          rich: true,
                        })}
                      </Text>
                    )}
                    {subtitleColumn && (
                      <Text size="xs" c="text-secondary" truncate fw="bold">
                        {formatValue(row[cols.indexOf(subtitleColumn)], {
                          ...(settings.column?.(subtitleColumn) || {}),
                          jsx: true,
                          rich: true,
                        })}
                      </Text>
                    )}
                  </div>
                </Flex>

                {rightColumns.map((col, colIndex) => {
                  const value = formatValue(row[cols.indexOf(col)], {
                    ...(settings.column?.(col) || {}),
                    jsx: true,
                    rich: true,
                  });
                  return (
                    <div
                      key={colIndex}
                      style={{
                        flexShrink: 0,
                      }}
                    >
                      <Text size="sm" c="text-secondary" truncate>
                        {value}
                      </Text>
                    </div>
                  );
                })}
              </Box>
            );
          })}
        </VirtualizedList>
      </Stack>
    </Stack>
  );
}

interface ColumnHeaderProps {
  column: DatasetColumn;
  subtitleColumn?: DatasetColumn | null;
  sortedColumnName?: string;
  sortingDirection?: "asc" | "desc";
  onSortClick: (column: DatasetColumn) => void;
  style?: CSSProperties;
}

function ColumnHeader({
  column,
  subtitleColumn,
  sortedColumnName,
  sortingDirection,
  style,
  onSortClick,
}: ColumnHeaderProps) {
  return (
    <button
      onClick={() => onSortClick(column)}
      style={{ ...style, cursor: "pointer", textAlign: "left" }}
    >
      <Text fw="bold" size="sm" c="text-medium" style={{ display: "inline" }}>
        {column.display_name}
        {subtitleColumn && " " + t`and` + " " + subtitleColumn.display_name}
      </Text>
      {sortedColumnName === column.name && (
        <Icon
          name={sortingDirection === "asc" ? "arrow_up" : "arrow_down"}
          c="text-medium"
          size={12}
          style={{ display: "inline", marginLeft: 4 }}
        />
      )}
    </button>
  );
}

function useListColumns(cols: DatasetColumn[]) {
  const titleColumn = useMemo(() => {
    return (
      cols.find((col) => Lib.isEntityName(Lib.legacyColumnTypeInfo(col))) ||
      cols.find((col) => Lib.isTitle(Lib.legacyColumnTypeInfo(col))) ||
      cols.find((col) => Lib.isID(Lib.legacyColumnTypeInfo(col)))
    );
  }, [cols]);

  const subtitleColumn = useMemo(() => {
    return titleColumn && Lib.isID(Lib.legacyColumnTypeInfo(titleColumn))
      ? null
      : cols.find((col) => Lib.isID(Lib.legacyColumnTypeInfo(col)));
  }, [cols, titleColumn]);

  const imageColumn = useMemo(() => {
    return cols.find(
      (col) =>
        Lib.isAvatarURL(Lib.legacyColumnTypeInfo(col)) ||
        Lib.isImageURL(Lib.legacyColumnTypeInfo(col)),
    );
  }, [cols]);

  const rightColumns = useMemo(() => {
    const usedColumns = new Set(
      [titleColumn, subtitleColumn, imageColumn].filter(Boolean),
    );

    return cols.filter((col) => !usedColumns.has(col)).slice(0, 5);
  }, [cols, titleColumn, subtitleColumn, imageColumn]);

  return {
    titleColumn,
    subtitleColumn,
    imageColumn,
    rightColumns,
  };
}
