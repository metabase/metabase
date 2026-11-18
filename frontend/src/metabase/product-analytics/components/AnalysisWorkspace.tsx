import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { isEventTableSetUp } from "metabase/product-analytics-core";
import { Group, Paper, Stack } from "metabase/ui";
import type { ProductAnalyticsKind, TableId } from "metabase-types/api";

import { AnalysisTitle } from "./AnalysisTitle";
import S from "./AnalysisWorkspace.module.css";
import { EventTablePicker } from "./EventTablePicker";
import { TableNotSetUp } from "./TableNotSetUp";

type AnalysisWorkspaceProps = {
  kind: ProductAnalyticsKind;
  tableId: TableId | undefined;
  onTableChange: (tableId: TableId) => void;
};

/**
 * A new analysis: the title and toolbar across the top, and the result below.
 * Without a table, the toolbar's table picker opens and nothing shows below.
 */
export const AnalysisWorkspace = ({
  kind,
  tableId,
  onTableChange,
}: AnalysisWorkspaceProps) => {
  const {
    data: table,
    isLoading,
    error,
  } = useGetTableQueryMetadataQuery(
    // Data Studio offers sensitive columns for the event table's roles, so
    // checking the table's setup needs them too.
    tableId !== undefined
      ? { id: tableId, include_sensitive_fields: true }
      : skipToken,
  );

  return (
    <Stack flex={1} h="100%" gap={0} bg="background_page-secondary">
      <Stack
        className={S.header}
        gap="md"
        pl="xxl"
        pr="lg"
        pt="lg"
        pb="md"
        bg="background_page-primary"
      >
        <AnalysisTitle kind={kind} tableName={table?.display_name} />
        <Group gap="sm">
          <EventTablePicker
            table={table}
            isLoading={isLoading}
            isInitiallyOpened={tableId === undefined}
            onChange={onTableChange}
          />
        </Group>
      </Stack>
      {tableId !== undefined && (
        <Stack flex={1} mih={0} py="lg" pl="xxl" pr="lg">
          <Paper withBorder radius="md" p="lg" flex={1} display="flex">
            <LoadingAndErrorWrapper
              className={S.result}
              loading={isLoading}
              error={error}
            >
              {table !== undefined && !isEventTableSetUp(table) && (
                <TableNotSetUp table={table} />
              )}
            </LoadingAndErrorWrapper>
          </Paper>
        </Stack>
      )}
    </Stack>
  );
};
