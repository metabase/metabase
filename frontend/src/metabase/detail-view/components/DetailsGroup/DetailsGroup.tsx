import {
  getColumnTitle,
  getRowValue,
  renderValue,
} from "metabase/detail-view/utils";
import { useTranslateContent } from "metabase/i18n/hooks";
import type { OptionsType } from "metabase/lib/formatting/types";
import { Flex, Group, Stack, Text, rem } from "metabase/ui";
import type { DatasetColumn, RowValues, Table } from "metabase-types/api";

import S from "./DetailsGroup.module.css";
import { Value } from "./Value";

interface Props {
  columns: DatasetColumn[];
  columnsSettings?: (OptionsType | undefined)[];
  responsive?: boolean;
  row: RowValues;
  table: Table | undefined;
}

export const DetailsGroup = ({
  columns,
  columnsSettings,
  responsive,
  row,
  table,
}: Props) => {
  const tc = useTranslateContent();

  return (
    <Stack data-testid="object-details" gap="lg">
      {columns.map((column, index) => {
        const field = table?.fields?.find((field) => field.id === column.id);
        const value = getRowValue(columns, column, row);
        const columnSettings = columnsSettings?.[index] ?? {};

        return (
          <Group
            align="flex-start"
            data-testid="object-details-row"
            gap="xl"
            key={index}
            wrap="nowrap"
          >
            <Text
              c="text-secondary"
              className={S.name}
              data-testid="column-name"
              flex={responsive ? "0 1 50%" : "0 0 auto"}
              w={responsive ? undefined : rem(224)}
            >
              {getColumnTitle(column, columnSettings)}
            </Text>

            <Flex data-testid="value" flex={responsive ? "0 1 50%" : "1"}>
              <Value column={column} field={field} value={value}>
                {renderValue(tc, value, column, columnSettings)}
              </Value>
            </Flex>
          </Group>
        );
      })}
    </Stack>
  );
};
