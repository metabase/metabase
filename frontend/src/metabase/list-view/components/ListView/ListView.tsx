import { type CSSProperties, useMemo } from "react";
import { t } from "ttag";

import { VirtualizedList } from "metabase/common/components/VirtualizedList";
import { formatValue } from "metabase/lib/formatting";
import { Box, Flex, Image, Stack, Text } from "metabase/ui";
import { useObjectDetail } from "metabase/visualizations/components/TableInteractive/hooks/use-object-detail";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type { DatasetColumn, DatasetData } from "metabase-types/api";

import styles from "./ListView.module.css";

const ListWrapper = ({ children, ...props }: { children: React.ReactNode }) => (
  <Stack gap="xs" {...props}>
    {children}
  </Stack>
);

export interface ListViewProps {
  data: DatasetData;
  settings: ComputedVisualizationSettings;
}

export function ListView({ data, settings }: ListViewProps) {
  const { cols, rows } = data;

  const { titleColumn, subtitleColumn, imageColumn, rightColumns } =
    useListColumns(cols);

  const formattedRows = useMemo(() => {
    return rows.map((row) => {
      const titleValue = titleColumn
        ? formatValue(row[cols.indexOf(titleColumn)], {
            ...(settings.column?.(titleColumn) || {}),
            jsx: true,
            rich: true,
          })
        : t`N/A`;

      const subtitleValue = subtitleColumn
        ? formatValue(row[cols.indexOf(subtitleColumn)], {
            ...(settings.column?.(subtitleColumn) || {}),
            jsx: true,
            rich: true,
          })
        : null;

      const imageValue = imageColumn ? row[cols.indexOf(imageColumn)] : null;

      return {
        titleValue,
        subtitleValue,
        imageValue,
        row,
      };
    });
  }, [rows, titleColumn, subtitleColumn, imageColumn, cols, settings]);

  const firstColumnWidth = imageColumn ? "320px" : "280px";
  const otherColumnWidths = "160px";

  const openObjectDetail = useObjectDetail(data);

  return (
    <Stack
      w="100%"
      h="100%"
      gap="xs"
      px="9rem"
      pt="xl"
      style={{ overflow: "auto" }}
    >
      <Flex justify="space-between" align="center" px="lg" mb="sm">
        <Flex
          align="center"
          gap="md"
          style={{ width: firstColumnWidth, flexShrink: 0 }}
        >
          {!!titleColumn && (
            <ColumnHeader
              column={titleColumn}
              subtitleColumn={subtitleColumn}
            />
          )}
        </Flex>

        <Flex gap="lg" align="center" style={{ flex: 1 }}>
          {rightColumns.map((col, colIndex) => (
            <ColumnHeader
              key={colIndex}
              column={col}
              style={{
                width: otherColumnWidths,
                flexShrink: 0,
              }}
            />
          ))}
        </Flex>
      </Flex>

      <VirtualizedList Wrapper={ListWrapper}>
        {formattedRows.map(
          ({ row, titleValue, subtitleValue, imageValue }, rowIndex) => {
            return (
              <Box
                key={rowIndex}
                className={styles.listItem}
                px="1.4rem"
                py="md"
                onClick={() => openObjectDetail(rowIndex)}
              >
                <Flex justify="space-between" align="center">
                  <Flex
                    align="center"
                    gap="md"
                    style={{ width: firstColumnWidth, flexShrink: 0 }}
                  >
                    {imageValue && (
                      <Image
                        src={imageValue}
                        alt=""
                        w={32}
                        h={32}
                        radius="xl"
                        style={{ flexShrink: 0 }}
                      />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Text fw="bold" truncate>
                        {titleValue}
                      </Text>
                      {subtitleValue && (
                        <Text size="xs" c="text-secondary" truncate fw="bold">
                          {subtitleValue}
                        </Text>
                      )}
                    </div>
                  </Flex>

                  <Flex gap="lg" align="center" style={{ flex: 1 }}>
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
                            width: otherColumnWidths,
                            flexShrink: 0,
                          }}
                        >
                          <Text size="sm" c="text-secondary" truncate>
                            {value}
                          </Text>
                        </div>
                      );
                    })}
                  </Flex>
                </Flex>
              </Box>
            );
          },
        )}
      </VirtualizedList>
    </Stack>
  );
}

interface ColumnHeaderProps {
  column: DatasetColumn;
  subtitleColumn?: DatasetColumn | null;
  style?: CSSProperties;
}

function ColumnHeader({ column, subtitleColumn, style }: ColumnHeaderProps) {
  return (
    <Text fw="bold" size="sm" c="text-medium" style={style}>
      {column.display_name}
      {subtitleColumn && " " + t`and` + " " + subtitleColumn.display_name}
    </Text>
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
