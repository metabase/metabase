import { useMemo } from "react";

import {
  getBodyColumns,
  getColumnTitle,
  getRowValue,
  renderValue,
} from "metabase/detail-view/utils";
import { useTranslateContent } from "metabase/i18n/hooks";
import type { OptionsType } from "metabase/lib/formatting/types";
import { Group, Stack, Text, rem } from "metabase/ui";
import type { DatasetColumn, RowValues, Table } from "metabase-types/api";

import S from "./DetailsGroup.module.css";
import { Value } from "./Value";

interface Props {
  columns: DatasetColumn[];
  columnsSettings?: (OptionsType | undefined)[];
  row: RowValues;
  table: Table | undefined;
}

export const DetailsGroup = ({
  columns,
  columnsSettings,
  row,
  table,
}: Props) => {
  const tc = useTranslateContent();
  const bodyColumns = useMemo(() => getBodyColumns(columns), [columns]);
  const columnIndexMap = useMemo(
    () => new Map(columns.map((column, index) => [column, index])),
    [columns],
  );

  return (
    <Stack gap="lg">
      {bodyColumns.map((column, index) => {
        const field = table?.fields?.find((field) => field.id === column.id);
        const value = getRowValue(columns, column, row);
        const realIndex = columnIndexMap.get(column) ?? -1;
        const columnSettings = columnsSettings?.[realIndex] ?? {};

        return (
          <Group align="flex-start" gap="xl" key={index} wrap="nowrap">
            <Text
              c="text-secondary"
              className={S.name}
              flex="0 0 auto"
              w={rem(224)}
            >
              {getColumnTitle(column, columnSettings)}
            </Text>

            <Value column={column} field={field} value={value}>
              {renderValue(tc, value, column, columnSettings)}
            </Value>
          </Group>
        );
      })}
    </Stack>
  );
};
