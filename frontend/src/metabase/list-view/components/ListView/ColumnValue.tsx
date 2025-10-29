import { useMemo } from "react";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { formatNumber, formatValue } from "metabase/lib/formatting";
import { Badge, Box, Flex, Icon, Image, Stack, Text } from "metabase/ui";
import { MiniBarCell } from "metabase/visualizations/components/TableInteractive/cells/MiniBarCell";
import { getColumnExtent } from "metabase/visualizations/lib/utils";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type {
  ColumnSettings,
  DatasetColumn,
  RowValues,
} from "metabase-types/api";

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

const DEFAULT_COLUMN_SETTINGS: ColumnSettings = {};
export function ColumnValue({
  column,
  settings,
  rawValue,
  style,
  rows,
  cols,
}: ColumnValueProps) {
  const columnSettings = settings.column?.(column);
  const value = useMemo(
    () =>
      formatValue(rawValue, {
        ...(columnSettings || DEFAULT_COLUMN_SETTINGS),
        jsx: true,
        rich: true,
      }),
    [rawValue, columnSettings],
  );

  if (rawValue == null) {
    return <div />;
  }

  if (column.base_type === "type/Boolean") {
    return (
      <Badge
        className={styles.badge}
        size="lg"
        c="text-primary"
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
            fw={400}
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
            color: "var(--mb-color-text-primary)",
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
          c={style?.color || "text-primary"}
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
      return (
        <Flex direction="row" align="center" gap="sm">
          <MiniBarCell
            rowIndex={0}
            columnId={column.name}
            value={Number(value)}
            barWidth="4rem"
            barHeight="0.25rem"
            extent={columnExtent}
            columnSettings={columnSettings || DEFAULT_COLUMN_SETTINGS}
            style={{
              paddingInline: 0,
              marginLeft: 0,
              width: "auto",
              border: "none",
            }}
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
        (formatNumber(Number(rawValue), {
          ...(settings.column?.(column) || {}),
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
          {currencyValue}
        </Text>
      );
    }
    case "type/ImageURL":
    case "type/AvatarURL":
      return (
        <Image
          src={rawValue}
          w="2rem"
          h="2rem"
          style={{
            objectFit: "cover",
            borderRadius: "0.5rem",
            border: "1px solid var(--mb-color-border-secondary)",
          }}
        />
      );
    case "type/Float":
    case "type/Number":
      return (
        <Ellipsified
          size="sm"
          truncate
          style={style}
          fw="bold"
          c="text-primary"
        >
          {value}
        </Ellipsified>
      );

    default:
      break;
  }

  return (
    <Ellipsified
      size="sm"
      truncate
      style={style}
      c={style?.color || "text-primary"}
    >
      {value}
    </Ellipsified>
  );
}
