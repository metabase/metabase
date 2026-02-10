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
import {
  isAvatarURL,
  isBoolean,
  isCurrency,
  isEmail,
  isEntityName,
  isFK,
  isFloat,
  isImageURL,
  isNumber,
  isPK,
  isPercentage,
  isProduct,
  isQuantity,
  isScore,
  isSource,
  isState,
  isTitle,
  isURL,
} from "metabase-lib/v1/types/utils/isa";
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

  if (isBoolean(column)) {
    return (
      <Badge
        className={styles.badge}
        size="lg"
        c="text-primary"
        variant="outline"
        style={{
          background: "var(--mb-color-background-primary)",
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

  // switch (column.semantic_type) {
  switch (true) {
    case isPK(column):
    case isFK(column):
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
    // Not using `isCategory` because it incorrectly gives false positive
    // for many other category subtypes, like Name / Title / City (which we don't want here).
    case column.semantic_type === TYPE.Category:
      return (
        <Badge
          className={styles.badge}
          size="lg"
          variant="outline"
          style={{
            background: "var(--mb-color-background-primary)",
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
    case isState(column):
      return (
        <Badge
          className={styles.badge}
          size="lg"
          variant="outline"
          style={{
            background: "var(--mb-color-background-primary)",
          }}
        >
          {value}
        </Badge>
      );
    case isEntityName(column):
    case isTitle(column):
    case isProduct(column):
    case isSource(column):
      return (
        <Ellipsified
          size="sm"
          truncate
          fw="bold"
          style={style}
          c={style?.color ? undefined : "text-primary"}
        >
          {value}
        </Ellipsified>
      );
    case isEmail(column):
    case isURL(column) && !isImageURL(column) && !isAvatarURL(column):
      return (
        <Ellipsified size="sm" fw="bold" style={style} tooltip={rawValue}>
          {value}
        </Ellipsified>
      );
    case isQuantity(column):
    case isScore(column): {
      if (!column?.settings?.["show_mini_bar"]) {
        return <Text fw="bold">{value}</Text>;
      }

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
    case isPercentage(column): {
      return (
        <Badge
          size="lg"
          className={styles.badge}
          variant="outline"
          style={{
            background: "var(--mb-color-background-primary)",
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
    case isCurrency(column): {
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
    case isImageURL(column):
    case isAvatarURL(column):
      return (
        <Image
          src={rawValue}
          w="2rem"
          h="2rem"
          style={{
            objectFit: "cover",
            borderRadius: "0.5rem",
            border: "1px solid var(--mb-color-border)",
          }}
        />
      );
    case isFloat(column):
    case isNumber(column):
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
      c={style?.color ? undefined : "text-primary"}
    >
      {value}
    </Ellipsified>
  );
}
