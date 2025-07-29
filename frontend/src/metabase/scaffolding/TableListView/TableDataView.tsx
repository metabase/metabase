import { useMemo } from "react";
import { Link } from "react-router";

import { useTranslateContent } from "metabase/i18n/hooks";
import { ActionIcon, Box, Group, Icon, Text } from "metabase/ui";
import type { DatasetColumn } from "metabase/visualizations/lib/settings/column";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type { ComponentSettings, RowValues, Table } from "metabase-types/api";

import { renderValue } from "../utils";

import S from "./TableListView.module.css";
import type { SortState } from "./types";

interface TableDataViewProps {
  columns: DatasetColumn[];
  rows: RowValues[];
  settings: ComponentSettings;
  sortState: SortState | null;
  table: Table;
  onSort: (column: DatasetColumn) => void;
}

const CELL_PADDING_HORIZONTAL = "md" as const;
const CELL_PADDING_VERTICAL_NORMAL = "sm" as const;
const CELL_PADDING_VERTICAL_THIN = "xs" as const;

export const TableDataView = ({
  columns: allColumns,
  rows,
  settings,
  sortState,
  onSort,
  table,
}: TableDataViewProps) => {
  const tc = useTranslateContent();

  const columns = settings.list_view.table.fields.map(({ field_id }) => {
    return allColumns.find((field) => field.id === field_id)!;
  });

  const transformedRows = useMemo(
    () =>
      rows.map((row) => {
        return settings.list_view.table.fields.map(({ field_id }) => {
          const fieldIndex = allColumns.findIndex((col) => col.id === field_id);
          return row[fieldIndex];
        });
      }),
    [settings, rows, allColumns],
  );

  const cellPaddingVertical =
    settings.list_view.table.row_height === "normal"
      ? CELL_PADDING_VERTICAL_NORMAL
      : CELL_PADDING_VERTICAL_THIN;

  const pkIndex = allColumns.findIndex(isPK); // TODO: handle multiple PKs

  return (
    <Group
      className={S.tableContainer}
      align="flex-start"
      wrap="nowrap"
      style={{ overflow: "auto" }}
    >
      <Box bg="white" className={S.table} component="table" w="100%">
        <thead>
          <tr>
            <Box component="th" px="sm" py="md" />

            {columns.map((column, index) => (
              <Box
                component="th"
                key={index}
                px={CELL_PADDING_HORIZONTAL}
                py="md"
                style={{ cursor: "pointer" }}
                onClick={() => onSort(column)}
              >
                <Group gap="sm" align="center" wrap="nowrap">
                  <Text c="text-secondary" size="sm">
                    {column.display_name}
                  </Text>

                  {sortState && sortState.columnId === column.id && (
                    <Icon
                      c="text-secondary"
                      name={
                        sortState.direction === "asc"
                          ? "chevronup"
                          : "chevrondown"
                      }
                      size={12}
                    />
                  )}
                </Group>
              </Box>
            ))}
          </tr>
        </thead>

        <tbody>
          {transformedRows.map((row, index) => {
            return (
              <Box className={S.row} component="tr" key={index}>
                <Box
                  component="td"
                  pl={CELL_PADDING_HORIZONTAL}
                  py={cellPaddingVertical}
                >
                  <ActionIcon
                    className={S.link}
                    component={Link}
                    to={
                      pkIndex !== undefined && pkIndex >= 0
                        ? `/table/${table.id}/detail/${rows[index][pkIndex]}`
                        : ""
                    }
                    variant="outline"
                  >
                    <Icon name="share" />
                  </ActionIcon>
                </Box>

                {row.map((value, cellIndex) => {
                  return (
                    <Box
                      c={
                        settings.list_view.table.fields[cellIndex].style ===
                        "dim"
                          ? "text-light"
                          : "text-primary"
                      }
                      component="td"
                      fw={
                        settings.list_view.table.fields[cellIndex].style ===
                        "bold"
                          ? "bold"
                          : undefined
                      }
                      key={cellIndex}
                      px={CELL_PADDING_HORIZONTAL}
                      py={cellPaddingVertical}
                    >
                      {renderValue(tc, value, columns[cellIndex])}
                    </Box>
                  );
                })}
              </Box>
            );
          })}
        </tbody>
      </Box>
    </Group>
  );
};
