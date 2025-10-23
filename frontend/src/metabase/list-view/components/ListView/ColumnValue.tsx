import { Ellipsified } from "metabase/common/components/Ellipsified";
import { formatValue } from "metabase/lib/formatting";
import { Badge, Box, Icon, Stack, Text } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { DatasetColumn } from "metabase-types/api";

// Light background colors for category values
const CATEGORY_COLORS = [
  "accent0",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "accent5",
  "accent6",
  "accent7",
];

// Get a consistent color for a category value based on its hash
const getCategoryColor = (value: any, columnName: string) => {
  if (value == null || value === "") {
    return "var(--mb-color-background-light)";
  }

  const stringValue = String(value);

  // Use a combination of column name and value for more consistent colors
  const combinedString = `${columnName}:${stringValue}`;
  const hash = combinedString.split("").reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);

  const colorIndex = Math.abs(hash) % CATEGORY_COLORS.length;
  return color(CATEGORY_COLORS[colorIndex]);
};

interface ColumnValueProps {
  column: DatasetColumn;
  settings: ComputedVisualizationSettings;
  rawValue: any;
  style?: React.CSSProperties;
}

export function ColumnValue({
  column,
  settings,
  rawValue,
  style,
}: ColumnValueProps) {
  const columnSettings = settings.column?.(column) || {};
  const value = formatValue(rawValue, {
    ...columnSettings,
    jsx: true,
    rich: true,
  });
  if (!rawValue) {
    return null;
  }

  if (column.base_type === "type/Boolean") {
    return (
      <Badge
        px="sm"
        size="lg"
        c="text-secondary"
        variant="outline"
        style={{
          borderColor: "var(--mb-color-border-secondary)",
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
            px="sm"
            size="lg"
            c="text-secondary"
            variant="outline"
            style={{ borderColor: "var(--mb-color-border-secondary)" }}
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
          px="sm"
          size="lg"
          c="text-secondary"
          variant="outline"
          style={{
            borderColor: "var(--mb-color-border-secondary)",
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
    case "type/Quantity":
    case "type/Score":
      return (
        <Ellipsified size="sm" fw="bold" style={style}>
          {value}
        </Ellipsified>
      );
    case "type/Percentage":
      return (
        <Badge
          size="lg"
          c="text-secondary"
          variant="outline"
          style={{
            borderColor: "var(--mb-color-border-secondary)",
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
