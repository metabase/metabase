import type { ReactNode } from "react";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Box, Flex, Text } from "metabase/ui";
import type { DatasetColumn } from "metabase-types/api";

import styles from "./ListView.module.css";

// Light background colors for category values
const CATEGORY_COLORS = [
  "color-mix(in srgb, var(--mb-color-brand) 8%, white)",
  "color-mix(in srgb, var(--mb-color-success) 8%, white)",
  "color-mix(in srgb, var(--mb-color-warning) 8%, white)",
  "color-mix(in srgb, var(--mb-color-error) 8%, white)",
  "color-mix(in srgb, var(--mb-color-filter) 8%, white)",
  "color-mix(in srgb, var(--mb-color-summarize) 8%, white)",
  "color-mix(in srgb, var(--mb-color-focus) 8%, white)",
  "color-mix(in srgb, var(--mb-color-text-medium) 8%, white)",
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
  return CATEGORY_COLORS[colorIndex];
};

interface ColumnValueProps {
  column: DatasetColumn;
  value: ReactNode;
  rawValue: any;
}

export function ColumnValue({ column, value, rawValue }: ColumnValueProps) {
  const isBooleanColumn = column.base_type === "type/Boolean";
  const isCategoryColumn = column.semantic_type === "type/Category";
  const isScoreColumn = column.semantic_type === "type/Score";
  const shouldGetCategoryStyling = isCategoryColumn || isScoreColumn;

  if (isBooleanColumn) {
    return (
      <Flex align="center" gap="xs">
        <Box
          w={8}
          h={8}
          style={{
            borderRadius: "50%",
            backgroundColor:
              rawValue === true
                ? "var(--mb-color-success)"
                : "var(--mb-color-error)",
            flexShrink: 0,
          }}
        />
        <Text fw="bold" size="sm" c="text-secondary">
          {value}
        </Text>
      </Flex>
    );
  }

  if (shouldGetCategoryStyling && rawValue != null && rawValue !== "") {
    return (
      <Box
        className={styles.categoryValue}
        style={{ backgroundColor: getCategoryColor(rawValue, column.name) }}
      >
        <Ellipsified fw="bold" size="sm" c="text-secondary">
          {value}
        </Ellipsified>
      </Box>
    );
  }

  return (
    <Ellipsified fw="bold" size="sm" c="text-secondary" truncate>
      {value}
    </Ellipsified>
  );
}
