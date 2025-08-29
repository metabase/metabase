import cx from "classnames";
import type { CSSProperties } from "react";

import { formatValue } from "metabase/lib/formatting";
import { Box, Flex, Icon, type IconName, Image, Text } from "metabase/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { DatasetColumn, DatasetData } from "metabase-types/api";

import { ColumnValue } from "./ColumnValue";
import styles from "./ListView.module.css";

export interface ListViewItemProps {
  className?: string;
  row: DatasetData["rows"][number];
  cols: DatasetColumn[];
  settings: ComputedVisualizationSettings;
  entityIcon: string;
  imageColumn?: DatasetColumn | null;
  titleColumn?: DatasetColumn | null;
  subtitleColumn?: DatasetColumn | null;
  rightColumns: DatasetColumn[];
  style?: CSSProperties;
  onClick: () => void;
}

export function ListViewItem({
  row,
  cols,
  settings,
  entityIcon,
  imageColumn,
  titleColumn,
  subtitleColumn,
  rightColumns,
  style,
  className,
  onClick,
}: ListViewItemProps) {
  return (
    <Box
      className={cx(styles.listItem, className)}
      onClick={onClick}
      style={style}
    >
      {/* Entity Type Icon */}
      <Box
        w={32}
        h={32}
        style={{
          border: "1px solid var(--mb-color-border)",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          backgroundColor: "var(--mb-color-background-light)",
        }}
      >
        <Icon name={entityIcon as IconName} size={16} c="text-light" />
      </Box>

      {/* Title and Subtitle Content */}
      <div>
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
              <Text size="sm" c="text-secondary" truncate fw="bold">
                {formatValue(row[cols.indexOf(subtitleColumn)], {
                  ...(settings.column?.(subtitleColumn) || {}),
                  jsx: true,
                  rich: true,
                })}
              </Text>
            )}
          </div>
        </Flex>
      </div>

      {/* Right Columns */}
      {rightColumns.map((col, colIndex) => {
        const rawValue = row[cols.indexOf(col)];
        const value = formatValue(rawValue, {
          ...(settings.column?.(col) || {}),
          jsx: true,
          rich: true,
        });

        return (
          <div key={colIndex}>
            <ColumnValue column={col} value={value} rawValue={rawValue} />
          </div>
        );
      })}
    </Box>
  );
}
