import { useMemo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import {
  getBodyColumns,
  getRowValue,
  renderValue,
} from "metabase/detail-view/utils";
import { useTranslateContent } from "metabase/i18n/hooks";
import { Group, Stack, Text, rem } from "metabase/ui";
import { isFK } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, RowValues, Table } from "metabase-types/api";

import S from "./DetailsGroup.module.css";

interface Props {
  columns: DatasetColumn[];
  row: RowValues;
  table: Table;
}

export const DetailsGroup = ({ columns, row, table }: Props) => {
  const tc = useTranslateContent();
  const bodyColumns = useMemo(() => getBodyColumns(columns), [columns]);

  return (
    <Stack gap="lg">
      {bodyColumns.map((column, index) => {
        const value = getRowValue(columns, column, row);
        const isEmptyValue = value == null || value === "";
        const isFk = isFK(column);
        const field = table.fields?.find((f) => f.id === column.id);
        const newTableId = field?.target?.table_id;

        return (
          <Group align="flex-start" gap="xl" key={index}>
            <Text
              c="text-secondary"
              className={S.name}
              flex="0 0 auto"
              w={rem(224)}
            >
              {column.display_name}
            </Text>

            {isEmptyValue && <Text c="text-light">{t`empty`}</Text>}

            {!isEmptyValue && (!isFk || newTableId == null) && (
              <Text c="text-primary" className={S.value} flex="1" fw="bold">
                {renderValue(tc, value, column)}
              </Text>
            )}

            {!isEmptyValue && isFk && newTableId != null && (
              <Text
                c="text-primary"
                className={S.fk}
                component={Link}
                fw="bold"
                my={rem(-1)}
                px="sm"
                to={`/table/${newTableId}/detail/${value}`}
              >
                {renderValue(tc, value, column)}
              </Text>
            )}
          </Group>
        );
      })}
    </Stack>
  );
};
