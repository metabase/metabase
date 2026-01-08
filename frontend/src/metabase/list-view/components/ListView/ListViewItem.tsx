import cx from "classnames";
import type { CSSProperties } from "react";

import { Box, Flex, Icon, type IconName, Image } from "metabase/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { DatasetColumn, DatasetData } from "metabase-types/api";

import { ColumnValue } from "./ColumnValue";
import styles from "./ListView.module.css";
import { getIconBackground } from "./styling";

export interface ListViewItemProps {
  className?: string;
  row: DatasetData["rows"][number];
  rows: DatasetData["rows"];
  cols: DatasetColumn[];
  settings: ComputedVisualizationSettings;
  entityIcon?: string;
  entityIconColor?: string;
  imageColumn?: DatasetColumn | null;
  titleColumn?: DatasetColumn | null;
  rightColumns?: DatasetColumn[];
  style?: CSSProperties;
  onClick: () => void;
}

export function ListViewItem({
  cols,
  rows,
  row,
  settings,
  entityIcon,
  entityIconColor,
  imageColumn,
  titleColumn,
  rightColumns,
  style,
  className,
  onClick,
}: ListViewItemProps) {
  const imgSrc = (imageColumn && row[cols.indexOf(imageColumn)]) || null;
  return (
    <Box
      className={cx(styles.listItem, className, {
        [styles.withIcon]: !!(entityIcon || imageColumn),
      })}
      onClick={onClick}
      style={style}
    >
      {entityIcon && !imageColumn && (
        <Box
          w={32}
          h={32}
          style={{
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            backgroundColor: getIconBackground(entityIconColor),
          }}
        >
          {/* @ts-expect-error viz components may be passed arbitrary color values */}
          <Icon name={entityIcon as IconName} c={entityIconColor} />
        </Box>
      )}
      {imageColumn && (
        <Image
          src={imgSrc}
          alt=""
          w={32}
          h={32}
          radius="xl"
          style={{
            flexShrink: 0,
            visibility: imgSrc ? "visible" : "hidden",
          }}
        />
      )}

      <Flex align="center" gap="md" style={{ flexShrink: 0 }}>
        {titleColumn && (
          <ColumnValue
            rows={rows}
            cols={cols}
            column={titleColumn}
            settings={settings}
            rawValue={row[cols.indexOf(titleColumn as DatasetColumn)]}
          />
        )}
      </Flex>

      {rightColumns?.map((col) => {
        const rawValue = row[cols.indexOf(col)];
        return (
          <ColumnValue
            key={col.name}
            rows={rows}
            cols={cols}
            settings={settings}
            column={col}
            rawValue={rawValue}
          />
        );
      })}
    </Box>
  );
}
