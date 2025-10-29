import { useMemo } from "react";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import {
  formatNumber,
  formatValue,
  getCurrencySymbol,
} from "metabase/lib/formatting";
import { Badge, Box, Flex, Icon, Image, Stack, Text } from "metabase/ui";
import { MiniBarCell } from "metabase/visualizations/components/TableInteractive/cells/MiniBarCell";
import { getColumnExtent } from "metabase/visualizations/lib/utils";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { TYPE } from "metabase-lib/v1/types/constants";
import { isQuantity, isScore } from "metabase-lib/v1/types/utils/isa";
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
  const columnSettings = useMemo(
    () => settings.column?.(column),
    [column, settings],
  );
  const value = useMemo(
    () =>
      formatValue(rawValue, {
        ...(columnSettings || DEFAULT_COLUMN_SETTINGS),
        jsx: true,
        rich: true,
      }),
    [rawValue, columnSettings],
  );
  const columnExtent = useMemo(() => {
    if (isQuantity(column) || isScore(column)) {
      return getColumnExtent(cols, rows, cols.indexOf(column));
    }
    return null;
  }, [cols, rows, column]);

  // Need to return empty element here to preserve grid column layout in ListViewItem.
  if (rawValue == null) {
    return <div />;
  }

  if (column.base_type === TYPE.Boolean) {
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
    case TYPE.PK:
    case TYPE.FK:
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
    case TYPE.Category:
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
    case TYPE.State:
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
    case TYPE.Name:
    case TYPE.Title:
    case TYPE.Product:
    case TYPE.Source:
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
    case TYPE.Email:
    case TYPE.URL:
      return (
        <Ellipsified size="sm" fw="bold" style={style} tooltip={rawValue}>
          {value}
        </Ellipsified>
      );
    case TYPE.Quantity:
    case TYPE.Score: {
      return (
        <Flex direction="row" align="center" gap="sm">
          <MiniBarCell
            rowIndex={0}
            columnId={column.name}
            value={Number(rawValue)}
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
    case TYPE.Percentage: {
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
            {String(value).slice(0, -1)}
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
    case TYPE.Currency: {
      const options = settings.column?.(column) || {};
      const formattedValue = formatNumber(Number(rawValue), options);

      if (
        options.currency_style === "symbol" &&
        typeof options.currency === "string"
      ) {
        const currencySymbol = getCurrencySymbol(options?.currency);
        const currencyValue = formattedValue.replace(currencySymbol, "");

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

      return <Text fw="bold">{formattedValue}</Text>;
    }
    case TYPE.ImageURL:
    case TYPE.AvatarURL:
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
    case TYPE.Float:
    case TYPE.Number:
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
