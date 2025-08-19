import { useMemo } from "react";
import { t } from "ttag";

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
import { Box, Button, Group, Icon, Stack, Tooltip, rem } from "metabase/ui";
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
  onNextClick: (() => void) | undefined;
  onPreviousClick: (() => void) | undefined;
}

export function DetailViewSidesheet({
  columns,
  row,
  rowId,
  table,
  tableForeignKeys,
  onClose,
  onNextClick,
  onPreviousClick,
}: Props) {
  const headerColumns = useMemo(() => getHeaderColumns(columns), [columns]);
  const rowName = getRowName(columns, row) || rowId;
  const icon = getEntityIcon(table.entity_type);

  return (
    <Sidesheet
      actions={
        <>
          <Tooltip disabled={!onPreviousClick} label={t`Previous row`}>
            <Button
              c="text-dark"
              disabled={!onPreviousClick}
              h={20}
              leftSection={<Icon name="chevronup" />}
              variant="subtle"
              style={{
                opacity: onPreviousClick ? undefined : 0.5,
              }}
              w={20}
              onClick={onPreviousClick}
            />
          </Tooltip>

          <Tooltip disabled={!onNextClick} label={t`Next row`}>
            <Button
              c="text-dark"
              disabled={!onNextClick}
              h={20}
              leftSection={<Icon name="chevrondown" />}
              variant="subtle"
              style={{
                opacity: onNextClick ? undefined : 0.5,
              }}
              w={20}
              onClick={onNextClick}
            />
          </Tooltip>
        </>
      }
      onClose={onClose}
    >
      <Stack data-testid="object-detail" gap={0} mih="100%">
        {headerColumns.length > 0 && (
          <Box pb="md" pt="sm" px={rem(56)}>
            <Box
              // intentionally misalign the header to create an "optical alignment effect" (due to rounded avatar)
              ml={rem(-8)}
            >
              <Header columns={columns} icon={icon} row={row} />
            </Box>
          </Box>
        )}

        <Group pb={rem(48)} pt="xl" px={rem(56)}>
          <Stack gap={rem(64)} h="100%" maw={rem(900)} w="100%">
            {columns.length - headerColumns.length > 0 && (
              <DetailsGroup columns={columns} row={row} table={table} />
            )}
          </Stack>
        </Group>

        {tableForeignKeys && tableForeignKeys.length > 0 && (
          <Box
            flex="1"
            bg="var(--mb-color-background-light)"
            px={rem(56)}
            py={rem(48)}
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
