import { useMemo } from "react";

import {
  getBodyColumns,
  getColumnTitle,
  getRowValue,
  renderValue,
} from "metabase/detail-view/utils";
import { useTranslateContent } from "metabase/i18n/hooks";
import { Group, Stack, Text, rem } from "metabase/ui";
import type { DatasetColumn, RowValues, Table } from "metabase-types/api";

import S from "./DetailsGroup.module.css";
import { Value } from "./Value";

interface Props {
  columns: DatasetColumn[];
  row: RowValues;
  table: Table | undefined;
}

export const DetailsGroup = ({ columns, row, table }: Props) => {
  const tc = useTranslateContent();
  const bodyColumns = useMemo(() => getBodyColumns(columns), [columns]);

  return (
    <Stack gap="lg">
      {bodyColumns.map((column, index) => {
        const field = table?.fields?.find((f) => f.id === column.id);
        const value = getRowValue(columns, column, row);

        return (
          <Group align="flex-start" gap="xl" key={index} wrap="nowrap">
            <Text
              c="text-secondary"
              className={S.name}
              flex="0 0 auto"
              w={rem(224)}
            >
              {getColumnTitle(column)}
            </Text>

            <Value column={column} field={field} value={value}>
              {renderValue(tc, value, column)}
            </Value>
          </Group>
        );
      })}
    </Stack>
  );
};
