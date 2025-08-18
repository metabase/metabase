import { useVirtualizer } from "@tanstack/react-virtual";
import { type CSSProperties, useMemo, useRef } from "react";
import { useMount } from "react-use";

import { formatValue } from "metabase/lib/formatting";
import { Box, Flex, Icon, Image, Stack, Text } from "metabase/ui";
import { useObjectDetail } from "metabase/visualizations/components/TableInteractive/hooks/use-object-detail";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Card, DatasetColumn, DatasetData } from "metabase-types/api";

import { ColumnValue } from "./ColumnValue";
import styles from "./ListView.module.css";

export interface ListViewProps {
  data: DatasetData;
  settings: ComputedVisualizationSettings;
  sortedColumnName?: string;
  sortingDirection?: "asc" | "desc";
  onSortClick: (column: DatasetColumn) => void;
  entityType?: string;
  card: Card;
  metadata?: Metadata;
  rowIndex?: number;
}

export function ListView({
  data,
  settings,
  sortedColumnName: _sortedColumnName,
  sortingDirection: _sortingDirection,
  onSortClick: _onSortClick,
  entityType,
  card,
  metadata,
  rowIndex,
}: ListViewProps) {
  const { cols, rows } = data;

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 70,
    // Allow dynamic row heights when content wraps in the right subgrid
    measureElement: (el) => {
      console.log("measureElement");
      return el.getBoundingClientRect().height;
    },
    overscan: 10,
  });
  const virtualRows = virtualizer.getVirtualItems();

  const { titleColumn, subtitleColumn, imageColumn, rightColumns } =
    useListColumns(cols);

  const openObjectDetail = useObjectDetail(data, card, metadata);
  useMount(() => {
    if (rowIndex && rowIndex < rows.length) {
      window.requestAnimationFrame(() => {
        virtualizer.scrollToIndex(rowIndex, { align: "center" });
      });
    }
  });

  // Get the appropriate icon based on entity type
  const getEntityIcon = (entityType?: string) => {
    switch (entityType) {
      case "entity/UserTable":
        return "person";
      case "entity/CompanyTable":
        return "company";
      case "entity/TransactionTable":
        return "receipt";
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
    <Stack className={styles.listViewContainer}>
      <Stack className={styles.listContainer}>
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
                    ref={virtualizer.measureElement}
                    data-index={index}
                    onClick={() => openObjectDetail(index)}
                    style={{
                      transform: `translateY(${start}px)`,
                    }}
                  >
                    <div className={styles.listCard}>
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
                      <Flex
                        align="flex-start"
                        gap="md"
                        style={{ flexShrink: 0 }}
                      >
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

                      {/* Right Columns Subgrid */}
                      {(() => {
                        const subgridColumns = Math.max(
                          3,
                          Math.min(4, rightColumns.length),
                        );
                        const rightGridStyle = {
                          ["--subgrid-columns" as any]: subgridColumns,
                        } as CSSProperties;
                        return (
                          <div
                            className={styles.rightGrid}
                            style={rightGridStyle}
                          >
                            {rightColumns.map((col, colIndex) => {
                              const rawValue = row[cols.indexOf(col)];
                              const value = formatValue(rawValue, {
                                ...(settings.column?.(col) || {}),
                                jsx: true,
                                rich: true,
                              });

                              return (
                                <div key={colIndex}>
                                  <Text
                                    size="xs"
                                    c="text-light"
                                    fw={500}
                                    style={{
                                      marginBottom:
                                        "calc(var(--mantine-spacing-xs) / 2)",
                                    }}
                                  >
                                    {col.display_name}
                                  </Text>
                                  <ColumnValue
                                    column={col}
                                    value={value}
                                    rawValue={rawValue}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
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

function useListColumns(cols: DatasetColumn[]) {
  const titleColumn = useMemo(() => {
    return (
      cols.find((col) => Lib.isEntityName(Lib.legacyColumnTypeInfo(col))) ||
      cols.find((col) => Lib.isTitle(Lib.legacyColumnTypeInfo(col))) ||
      cols.find((col) => Lib.isID(Lib.legacyColumnTypeInfo(col))) ||
      cols[0]
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

    return cols.filter((col) => !usedColumns.has(col));
  }, [cols, titleColumn, subtitleColumn, imageColumn]);

  return {
    titleColumn,
    subtitleColumn,
    imageColumn,
    rightColumns,
  };
}
