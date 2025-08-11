import { useMemo } from "react";
import { t } from "ttag";

import {
  getBodyColumns,
  getRowValue,
  renderValue,
} from "metabase/detail-view/utils";
import { useTranslateContent } from "metabase/i18n/hooks";
import { Group, Stack, Text, rem } from "metabase/ui";
import type { DatasetColumn, RowValues } from "metabase-types/api";

import S from "./DetailsGroup.module.css";

interface Props {
  columns: DatasetColumn[];
  row: RowValues;
}

export const DetailsGroup = ({ columns, row }: Props) => {
  const tc = useTranslateContent();
  const bodyColumns = useMemo(() => getBodyColumns(columns), [columns]);

  return (
    <Stack gap="lg">
      {bodyColumns.map((column, index) => {
        const value = getRowValue(columns, column, row);
        const isEmptyValue = value == null || value === "";

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

            {isEmptyValue ? (
              <Text c="text-light" flex="1">
                {t`empty`}
              </Text>
            ) : (
              <Text c="text-primary" className={S.value} flex="1" fw="bold">
                {renderValue(tc, value, column)}
              </Text>
            )}
          </Group>
        );
      })}
    </Stack>
  );
};
