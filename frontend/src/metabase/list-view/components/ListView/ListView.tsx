import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import { type CSSProperties, useMemo, useRef } from "react";
import { t } from "ttag";

import { Icon, Stack, Text } from "metabase/ui";
import { useObjectDetail } from "metabase/visualizations/components/TableInteractive/hooks/use-object-detail";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type {
  DatasetColumn,
  DatasetData,
  ListViewColumns,
} from "metabase-types/api";

import styles from "./ListView.module.css";
import { ListViewItem } from "./ListViewItem";

export interface ListViewProps {
  data: DatasetData;
  settings: ComputedVisualizationSettings;
  sortedColumnName?: string;
  sortingDirection?: "asc" | "desc";
  onSortClick: (column: DatasetColumn) => void;
  entityType?: string;
  isInteractive?: boolean;
  className?: string;
}

export function ListView({
  data,
  settings,
  sortedColumnName,
  sortingDirection,
  onSortClick,
  entityType,
  isInteractive,
  className,
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
    useListColumns(cols, settings?.["list.columns"]);

  const openObjectDetail = useObjectDetail();

  // Get the appropriate icon based on entity type
  const entityIcon =
    settings?.["list.entity_icon"] || getEntityIcon(entityType);

  return (
    <Stack
      data-testid="list-view"
      className={cx(styles.listViewContainer, className)}
      style={{ "--grid-columns": Math.max(rightColumns.length, 1) }}
    >
      <Stack className={styles.listContainer}>
        <div className={styles.listHeader}>
          {/* Entity Type Icon Column Placeholder */}
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
                  <ListViewItem
                    key={key}
                    row={row}
                    cols={cols}
                    settings={settings}
                    entityIcon={entityIcon}
                    imageColumn={imageColumn}
                    titleColumn={titleColumn}
                    subtitleColumn={subtitleColumn}
                    rightColumns={rightColumns}
                    onClick={() => isInteractive && openObjectDetail(index)}
                    className={styles.listItemVirtualized}
                    style={{
                      transform: `translateY(${start}px)`,
                      cursor: isInteractive ? "pointer" : "default",
                    }}
                  />
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
      style={{
        ...style,
        cursor: "pointer",
        textAlign: "left",
        display: "flex",
        alignItems: "center",
      }}
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

export function useListColumns(
  cols: DatasetColumn[],
  listSettings?: ListViewColumns,
) {
  // Column role is based on it's position in the list:
  // - First column is title
  // - Second column is subtitle
  // - Next 0-5 columns are right columns
  const titleColumn = useMemo(() => {
    return !listSettings
      ? null
      : cols.find((col) => listSettings?.left[0] === col.name);
  }, [cols, listSettings]);

  const subtitleColumn = useMemo(() => {
    return !listSettings || listSettings.left.length < 2
      ? null
      : cols.find((col) => listSettings?.left[1] === col.name);
  }, [cols, listSettings]);

  const imageColumn = useMemo(() => {
    return cols.find(
      (col) =>
        Lib.isAvatarURL(Lib.legacyColumnTypeInfo(col)) ||
        Lib.isImageURL(Lib.legacyColumnTypeInfo(col)),
    );
  }, [cols]);

  const rightColumns = useMemo(() => {
    return !listSettings
      ? []
      : (listSettings.right
          .map((colName) => cols.find((col) => col.name === colName))
          .filter(Boolean) as DatasetColumn[]);
  }, [cols, listSettings]);

  return {
    titleColumn,
    subtitleColumn,
    imageColumn,
    rightColumns,
  };
}

export const ENTITY_ICONS = {
  "entity/UserTable": "person",
  "entity/CompanyTable": "company",
  "entity/TransactionTable": "receipt",
  "entity/SubscriptionTable": "sync",
  "entity/ProductTable": "label",
  "entity/EventTable": "calendar",
  "entity/GenericTable": "document",
} as const;

export const getEntityIcon = (entityType?: string) => {
  return entityType
    ? ENTITY_ICONS[entityType as keyof typeof ENTITY_ICONS] || "document"
    : "document";
};
