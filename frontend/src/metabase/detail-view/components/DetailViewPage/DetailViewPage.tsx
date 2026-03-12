import { useViewportSize } from "@mantine/hooks";
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
import { NAV_SIDEBAR_WIDTH } from "metabase/nav/constants";
import { Box, Group, Stack, rem } from "metabase/ui";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  ForeignKey,
  RowValues,
  Table,
} from "metabase-types/api";

import S from "./DetailViewPage.module.css";

interface Props {
  columns: DatasetColumn[];
  isNavBarOpen: boolean;
  row: RowValues;
  rowId: string | number;
  table: Table;
  tableForeignKeys?: ForeignKey[];
}

const BREAKPOINT_MEDIUM = 1024;
const BREAKPOINT_SMALL = 640;

export function DetailViewPage({
  columns,
  isNavBarOpen,
  row,
  rowId,
  table,
  tableForeignKeys,
}: Props) {
  const headerColumns = useMemo(() => getHeaderColumns(columns), [columns]);
  const rowName = getRowName(columns, row) || rowId;
  const icon = getEntityIcon(table.entity_type);
  const viewport = useViewportSize();
  const navBarWidth = isNavBarOpen ? parseInt(NAV_SIDEBAR_WIDTH, 10) : 0;
  const width = viewport.width - navBarWidth;
  const isMediumBreakpoint = width <= BREAKPOINT_MEDIUM;
  const isSmallBreakpoint = width <= BREAKPOINT_SMALL;
  const paddingLeft = isSmallBreakpoint ? 32 : DETAIL_VIEW_PADDING_LEFT;
  const hasPk = columns.some(isPK);

  return (
    <Stack
      bg="background-secondary"
      data-testid="object-detail"
      gap={0}
      mih="100%"
    >
      {headerColumns.length > 0 && (
        <Box
          bg="background-primary"
          className={S.header}
          pl={rem(paddingLeft)}
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

      <Group
        align="stretch"
        flex="1"
        gap={0}
        key={rowId}
        mih={0}
        wrap={isMediumBreakpoint ? "wrap" : "nowrap"}
      >
        <Group
          align="flex-start"
          bg="background-primary"
          flex="1"
          p="xl"
          pl={rem(paddingLeft)}
          w={isMediumBreakpoint ? "100%" : undefined}
        >
          <Stack gap={rem(64)} h="100%" maw={rem(900)} w="100%">
            {columns.length > 0 && (
              <DetailsGroup
                columns={columns}
                responsive={isSmallBreakpoint}
                row={row}
                table={table}
              />
            )}
          </Stack>
        </Group>

        {hasPk && tableForeignKeys && tableForeignKeys.length > 0 && (
          <Box
            flex={isMediumBreakpoint ? undefined : "0 0 auto"}
            pl={rem(isMediumBreakpoint ? paddingLeft : 40)}
            pr={rem(40)}
            py="xl"
            w={isMediumBreakpoint ? "100%" : rem(440)}
          >
            <Relationships
              rowId={rowId}
              rowName={rowName}
              tableForeignKeys={tableForeignKeys}
            />
          </Box>
        )}
      </Group>
    </Stack>
  );
}
