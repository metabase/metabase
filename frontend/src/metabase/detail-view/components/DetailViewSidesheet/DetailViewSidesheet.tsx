import { useMemo } from "react";

import {
  DetailsGroup,
  Header,
  Relationships,
} from "metabase/detail-view/components";
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

import { Sidesheet } from "./Sidesheet";

interface Props {
  columns: DatasetColumn[];
  row: RowValues;
  rowId: string | number;
  table: Table;
  tableForeignKeys?: ForeignKey[];
  onClose: () => void;
}

export function DetailViewSidesheet({
  columns,
  row,
  rowId,
  table,
  tableForeignKeys,
  onClose,
}: Props) {
  const headerColumns = useMemo(() => getHeaderColumns(columns), [columns]);
  const rowName = getRowName(columns, row) || rowId;
  const icon = getEntityIcon(table.entity_type);

  return (
    <Sidesheet actions={<div>TODO</div>} onClose={onClose}>
      <Stack data-testid="object-detail" gap={0} mih="100%">
        {headerColumns.length > 0 && (
          <Box pb="xl" pt="sm" px={rem(56)}>
            <Box
              // intentionally misalign the header to create an "optical alignment effect" (due to rounded avatar)
              ml={rem(-8)}
            >
              <Header columns={columns} icon={icon} row={row} />
            </Box>
          </Box>
        )}

        <Group align="flex-start" flex="1" px={rem(56)}>
          <Stack gap={rem(64)} h="100%" maw={rem(900)} w="100%">
            {columns.length - headerColumns.length > 0 && (
              <DetailsGroup columns={columns} row={row} table={table} />
            )}
          </Stack>
        </Group>

        {tableForeignKeys && tableForeignKeys.length > 0 && (
          <Box
            bg="var(--mb-color-background-light)"
            px={rem(40)}
            py="xl"
            w={rem(440)}
          >
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
      </Stack>
    </Sidesheet>
  );
}
