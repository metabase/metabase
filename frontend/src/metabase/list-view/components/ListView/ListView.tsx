import { t } from "ttag";

import { formatValue } from "metabase/lib/formatting";
import { Box, Flex, Image, Stack, Text } from "metabase/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type { DatasetData } from "metabase-types/api";

import styles from "./ListView.module.css";

export interface ListViewProps {
  data: DatasetData;
  settings: ComputedVisualizationSettings;
}

export function ListView({ data, settings }: ListViewProps) {
  const { cols, rows } = data;

  const titleColumn =
    cols.find((col) => Lib.isEntityName(Lib.legacyColumnTypeInfo(col))) ||
    cols.find((col) => Lib.isTitle(Lib.legacyColumnTypeInfo(col))) ||
    cols.find((col) => Lib.isID(Lib.legacyColumnTypeInfo(col)));

  const subtitleColumn =
    titleColumn && Lib.isID(Lib.legacyColumnTypeInfo(titleColumn))
      ? null
      : cols.find((col) => Lib.isID(Lib.legacyColumnTypeInfo(col)));

  const imageColumn = cols.find(
    (col) =>
      Lib.isAvatarURL(Lib.legacyColumnTypeInfo(col)) ||
      Lib.isImageURL(Lib.legacyColumnTypeInfo(col)),
  );

  const usedColumns = new Set(
    [titleColumn, subtitleColumn, imageColumn].filter(Boolean),
  );
  const rightColumns = cols.filter((col) => !usedColumns.has(col)).slice(0, 5);

  const firstColumnWidth = imageColumn ? "320px" : "280px";
  const otherColumnWidths = "160px";

  return (
    <Stack
      w="100%"
      h="100%"
      gap="xs"
      px="9rem"
      pt="xl"
      style={{ overflowY: "auto" }}
    >
      <Flex justify="space-between" align="center" px="lg" pb="sm">
        <Flex
          align="center"
          gap="md"
          style={{ width: firstColumnWidth, flexShrink: 0 }}
        >
          <Text fw="bold" size="sm" c="text-medium">
            {titleColumn?.display_name}
            {subtitleColumn && " " + t`and` + " " + subtitleColumn.display_name}
          </Text>
        </Flex>

        <Flex gap="lg" align="center" style={{ flex: 1 }}>
          {rightColumns.map((col, colIndex) => (
            <Text
              key={colIndex}
              fw="bold"
              size="sm"
              c="text-medium"
              style={{
                width: otherColumnWidths,
                flexShrink: 0,
              }}
            >
              {col.display_name}
            </Text>
          ))}
        </Flex>
      </Flex>

      {rows.slice(0, 50).map((row, rowIndex) => {
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

        return (
          <Box key={rowIndex} className={styles.listItem} px="1.4rem" py="md">
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
      })}
    </Stack>
  );
}
