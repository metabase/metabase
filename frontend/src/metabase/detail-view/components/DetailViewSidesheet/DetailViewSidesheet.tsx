import { useMemo } from "react";

import {
  DetailsGroup,
  Header,
  Relationships,
} from "metabase/detail-view/components";
import { DETAIL_VIEW_PADDING_LEFT } from "metabase/detail-view/constants";
import {
  getEntityIcon,
  getHeaderColumns,
  getRowName,
} from "metabase/detail-view/utils";
import { Box, Group, Stack, rem } from "metabase/ui";
import type {
  DatasetColumn,
  ForeignKey,
  RowValues,
  Table,
} from "metabase-types/api";

import S from "./DetailViewSidesheet.module.css";

interface Props {
  columns: DatasetColumn[];
  row: RowValues;
  rowId: string | number;
  table: Table;
  tableForeignKeys?: ForeignKey[];
}

export function DetailViewSidesheet({
  columns,
  row,
  rowId,
  table,
  tableForeignKeys,
}: Props) {
  const headerColumns = useMemo(() => getHeaderColumns(columns), [columns]);
  const rowName = getRowName(columns, row) || rowId;
  const icon = getEntityIcon(table.entity_type);

  return (
    <Stack
      bg="var(--mb-color-background-light)"
      data-testid="object-detail"
      gap={0}
      mih="100%"
    >
      {headerColumns.length > 0 && (
        <Box
          bg="bg-white"
          className={S.header}
          pl={rem(DETAIL_VIEW_PADDING_LEFT)}
          pr="xl"
          py={rem(64)}
        >
          <Box
            // intentionally misalign the header to create an "optical alignment effect" (due to rounded avatar)
            ml={rem(-8)}
          >
            <Header columns={columns} icon={icon} row={row} />
          </Box>
        </Box>
      )}

      <Group align="stretch" flex="1" gap={0} key={rowId} mih={0} wrap="nowrap">
        <Group
          align="flex-start"
          bg="bg-white"
          flex="1"
          p="xl"
          pl={rem(DETAIL_VIEW_PADDING_LEFT)}
        >
          <Stack gap={rem(64)} h="100%" maw={rem(900)} w="100%">
            {columns.length - headerColumns.length > 0 && (
              <DetailsGroup columns={columns} row={row} table={table} />
            )}
          </Stack>
        </Group>

        {tableForeignKeys && tableForeignKeys.length > 0 && (
          <Box flex="0 0 auto" px={rem(40)} py="xl" w={rem(440)}>
            <Relationships
              columns={columns}
              row={row}
              rowId={rowId}
              rowName={rowName}
              table={table}
              tableForeignKeys={tableForeignKeys}
            />
          </Box>
        )}
      </Group>
    </Stack>
  );
}
