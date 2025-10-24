import { Ellipsified } from "metabase/common/components/Ellipsified";
import { formatValue } from "metabase/lib/formatting";
import { Badge, Box, Flex, Icon, Stack, Text } from "metabase/ui";
import { MiniBarCell } from "metabase/visualizations/components/TableInteractive/cells/MiniBarCell";
import { getColumnExtent } from "metabase/visualizations/lib/utils";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { DatasetColumn, RowValues } from "metabase-types/api";

import styles from "./ListView.module.css";
import { getCategoryColor } from "./styling";

interface ColumnValueProps {
  column: DatasetColumn;
  settings: ComputedVisualizationSettings;
  rawValue: any;
  style?: React.CSSProperties;
  rows: RowValues;
  cols: DatasetColumn[];
}

export function ColumnValue({
  column,
  settings,
  rawValue,
  style,
  rows,
  cols,
}: ColumnValueProps) {
  const columnSettings = settings.column?.(column) || {};
  const value = formatValue(rawValue, {
    ...columnSettings,
    jsx: true,
    rich: true,
  });
  if (rawValue == null) {
    return <div />;
  }

  if (column.base_type === "type/Boolean") {
    return (
      <Badge
        className={styles.badge}
        size="lg"
        c="text-secondary"
        variant="outline"
        style={{
          background: "var(--mb-color-bg-white)",
          textTransform: "capitalize",
        }}
        leftSection={
          <Icon
            name={rawValue === true ? "check" : "close"}
            size={12}
            mr="xs"
          />
        }
      >
        {value}
      </Badge>
    );
  }

  switch (column.semantic_type) {
    case "type/PK":
    case "type/FK":
      if (!column.remapped_to_column) {
        return (
          <Badge
            className={styles.badge}
            size="lg"
            variant="outline"
            leftSection={<Icon name="label" size={16} />}
          >
            {value}
          </Badge>
        );
      }
      break;
    case "type/Category":
      return (
        <Badge
          className={styles.badge}
          size="lg"
          variant="outline"
          style={{
            background: "var(--mb-color-bg-white)",
          }}
          leftSection={
            <Stack mr="0.25rem">
              <Box
                style={{
                  borderRadius: "50%",
                  width: "0.5rem",
                  height: "0.5rem",
                  backgroundColor: getCategoryColor(rawValue, column.name),
                }}
              />
            </Stack>
          }
        >
          {value}
        </Badge>
      );
    case "type/State":
      return (
        <Badge
          className={styles.badge}
          size="lg"
          variant="outline"
          style={{
            background: "var(--mb-color-bg-white)",
          }}
        >
          {value}
        </Badge>
      );
    case "type/Name":
    case "type/Title":
    case "type/Product":
    case "type/Source":
      return (
        <Ellipsified
          size="sm"
          truncate
          fw="bold"
          style={style}
          c={style?.color || "text-secondary"}
        >
          {value}
        </Ellipsified>
      );
    case "type/Email":
    case "type/URL":
      return (
        <Ellipsified size="sm" fw="bold" style={style}>
          {value}
        </Ellipsified>
      );
    case "type/Quantity":
    case "type/Score": {
      const columnExtent = getColumnExtent(cols, rows, cols.indexOf(column));
      const iconColor =
        settings["list.entity_icon_color"] === "text-primary"
          ? "var(--mb-color-brand)"
          : settings["list.entity_icon_color"];
      return (
        <Flex direction="row" align="center" gap="sm">
          <MiniBarCell
            rowIndex={0}
            columnId={column.name}
            value={Number(value)}
            barWidth="4rem"
            barHeight="0.25rem"
            barColor={iconColor}
            extent={columnExtent}
            columnSettings={columnSettings}
            style={{ paddingInline: 0, marginLeft: 0, width: "auto" }}
          />
          <Text fw="bold">{value}</Text>
        </Flex>
      );
    }
    case "type/Percentage": {
      return (
        <Badge
          size="lg"
          className={styles.badge}
          variant="outline"
          style={{
            background: "var(--mb-color-bg-white)",
          }}
        >
          <Text fw="bold">
            {value?.toString().slice(0, -1)}
            <span
              style={{
                color: "var(--mb-color-text-tertiary)",
                paddingLeft: "0.25rem",
              }}
            >
              %
            </span>
          </Text>
        </Badge>
      );
    }
    case "type/Currency": {
      const [currencySymbol, currencyValue] = (
        (formatValue(rawValue, {
          ...(settings.column?.(column) || {}),
          jsx: true,
          rich: true,
          split_currency: "|",
        }) as string) || ""
      ).split("|");
      return (
        <Text fw="bold">
          <span
            style={{
              color: "var(--mb-color-text-tertiary)",
              fontWeight: "normal",
              paddingRight: "0.25rem",
            }}
          >
            {currencySymbol}
          </span>
          {currencyValue?.slice(0, -1)}
        </Text>
      );
    }
    default:
      break;
  }

  return (
    <Ellipsified
      size="sm"
      truncate
      style={style}
      c={style?.color || "text-secondary"}
    >
      {value}
    </Ellipsified>
  );
}
