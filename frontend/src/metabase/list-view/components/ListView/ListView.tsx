import { useVirtualizer } from "@tanstack/react-virtual";
import { type CSSProperties, useMemo, useRef } from "react";
import { t } from "ttag";

import { formatValue } from "metabase/lib/formatting";
import { Box, Flex, Icon, Image, Stack, Text } from "metabase/ui";
import { useObjectDetail } from "metabase/visualizations/components/TableInteractive/hooks/use-object-detail";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type { DatasetColumn, DatasetData } from "metabase-types/api";

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

export interface ListViewProps {
  data: DatasetData;
  settings: ComputedVisualizationSettings;
  sortedColumnName?: string;
  sortingDirection?: "asc" | "desc";
  onSortClick: (column: DatasetColumn) => void;
  entityType?: string;
}

export function ListView({
  data,
  settings,
  sortedColumnName,
  sortingDirection,
  onSortClick,
  entityType,
}: ListViewProps) {
  const { cols, rows } = data;

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 10,
  });
  const virtualRows = virtualizer.getVirtualItems();

  const { titleColumn, subtitleColumn, imageColumn, rightColumns } =
    useListColumns(cols);

  const openObjectDetail = useObjectDetail(data);

  // Get the appropriate icon based on entity type
  const getEntityIcon = (entityType?: string) => {
    switch (entityType) {
      case "entity/UserTable":
        return "person";
      case "entity/CompanyTable":
        return "globe";
      case "entity/TransactionTable":
        return "index";
      case "entity/SubscriptionTable":
        return "sync";
      case "entity/ProductTable":
      case "entity/EventTable":
      case "entity/GenericTable":
      default:
        return "document";
    }
  };

  const entityIcon = getEntityIcon(entityType);

  return (
    <Stack
      className={styles.listViewContainer}
      style={{ "--grid-columns": rightColumns.length }}
    >
      <Stack className={styles.listContainer}>
        <div className={styles.listHeader}>
          {/* Entity Type Icon Column Header */}
          <div style={{ width: 32, flexShrink: 0 }} />

          {/* Title and Subtitle Column */}
          <div>
            {!!titleColumn && (
              <ColumnHeader
                column={titleColumn}
                subtitleColumn={subtitleColumn}
                sortedColumnName={sortedColumnName}
                sortingDirection={sortingDirection}
                onSortClick={onSortClick}
              />
            )}
          </div>

          {/* Right Columns */}
          {rightColumns.map((col, colIndex) => (
            <div key={colIndex}>
              <ColumnHeader
                column={col}
                sortedColumnName={sortedColumnName}
                sortingDirection={sortingDirection}
                onSortClick={onSortClick}
                style={{
                  flexShrink: 0,
                }}
              />
            </div>
          ))}
        </div>

        <div
          style={{
            height: "100%",
            overflowY: "auto",
          }}
          ref={scrollRef}
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            <Stack className={styles.listBody}>
              {virtualRows.map(({ key, index, start }) => {
                const row = rows[index];
                return (
                  <Box
                    key={key}
                    className={styles.listItem}
                    onClick={() => openObjectDetail(index)}
                    style={{
                      transform: `translateY(${start}px)`,
                    }}
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
                      <Icon name={entityIcon} size={16} c="text-light" />
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
                            <Text
                              size="sm"
                              c="text-secondary"
                              truncate
                              fw="bold"
                            >
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
                      const value = formatValue(row[cols.indexOf(col)], {
                        ...(settings.column?.(col) || {}),
                        jsx: true,
                        rich: true,
                      });

                      // Check if this is a boolean column
                      const isBooleanColumn = col.base_type === "type/Boolean";
                      const rawValue = row[cols.indexOf(col)];

                      // Check if this is a category column
                      const isCategoryColumn =
                        col.semantic_type === "type/Category";

                      // Check if this is a score column
                      const isScoreColumn = col.semantic_type === "type/Score";

                      // Check if this should get category-like styling
                      const shouldGetCategoryStyling =
                        isCategoryColumn || isScoreColumn;

                      return (
                        <div key={colIndex}>
                          {isBooleanColumn ? (
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
                          ) : shouldGetCategoryStyling &&
                            rawValue != null &&
                            rawValue !== "" ? (
                            <Box
                              style={{
                                padding: "4px 8px",
                                borderRadius: "100px",
                                border: "1px solid var(--mb-color-border)",
                                backgroundColor: getCategoryColor(
                                  rawValue,
                                  col.name,
                                ),
                                display: "inline-block",
                              }}
                            >
                              <Text fw="bold" size="sm" c="text-secondary">
                                {value}
                              </Text>
                            </Box>
                          ) : (
                            <Text
                              fw="bold"
                              size="sm"
                              c="text-secondary"
                              truncate
                            >
                              {value}
                            </Text>
                          )}
                        </div>
                      );
                    })}
                  </Box>
                );
              })}
            </Stack>
          </div>
        </div>
      </Stack>
    </Stack>
  );
}

interface ColumnHeaderProps {
  column: DatasetColumn;
  subtitleColumn?: DatasetColumn | null;
  sortedColumnName?: string;
  sortingDirection?: "asc" | "desc";
  onSortClick: (column: DatasetColumn) => void;
  style?: CSSProperties;
}

function ColumnHeader({
  column,
  subtitleColumn,
  sortedColumnName,
  sortingDirection,
  style,
  onSortClick,
}: ColumnHeaderProps) {
  return (
    <button
      onClick={() => onSortClick(column)}
      style={{ ...style, cursor: "pointer", textAlign: "left" }}
    >
      <Text fw="bold" size="sm" c="text-medium" style={{ display: "inline" }}>
        {column.display_name}
        {subtitleColumn && " " + t`and` + " " + subtitleColumn.display_name}
      </Text>
      {sortedColumnName === column.name && (
        <Icon
          name={sortingDirection === "asc" ? "arrow_up" : "arrow_down"}
          c="text-medium"
          size={12}
          style={{ display: "inline", marginLeft: 4 }}
        />
      )}
    </button>
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

    return cols.filter((col) => !usedColumns.has(col)).slice(0, 4);
  }, [cols, titleColumn, subtitleColumn, imageColumn]);

  return {
    titleColumn,
    subtitleColumn,
    imageColumn,
    rightColumns,
  };
}
