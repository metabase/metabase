import { memo, useMemo } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { NotFound } from "metabase/common/components/ErrorPages/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/LoadingAndErrorWrapper";
import { DetailsGroup, Header } from "metabase/detail-view/components";
import { getEntityIcon, getHeaderColumns } from "metabase/detail-view/utils";
import { Box, Group, Stack, rem } from "metabase/ui";
import type {
  DatabaseId,
  DatasetColumn,
  DatasetQuery,
  Field,
  FieldFilter,
  FieldId,
  FieldReference,
  Table,
  TableId,
} from "metabase-types/api";

import { Error } from "./Error";
import { getDataErrorMessage, is403Error } from "./utils";

interface Props {
  databaseId: DatabaseId;
  field: Field;
  fieldId: FieldId;
  table: Table;
  tableId: TableId;
}

const EMPTY_COLUMNS: DatasetColumn[] = [];

const DetailViewPreviewInner = ({
  databaseId,
  field,
  fieldId,
  table,
  tableId,
}: Props) => {
  const { error, isFetching, data, rowData, columns } = useDataSample({
    databaseId,
    field,
    fieldId,
    tableId,
  });

  const headerColumns = useMemo(() => getHeaderColumns(columns), [columns]);

  const icon = getEntityIcon(table?.entity_type);

  if (isFetching) {
    return (
      <Stack data-testid="loading-indicator" gap="sm" p="lg">
        <LoadingAndErrorWrapper error={error} loading={isFetching} />;
      </Stack>
    );
  }

  if (error) {
    return <Error message={error} />;
  }

  if (!data || !rowData) {
    return (
      <Group align="center" justify="center">
        <NotFound message={t`We couldn't find that record`} />
      </Group>
    );
  }

  return (
    <Stack gap={0} mih="100%">
      {headerColumns.length > 0 && (
        <Box pb="md" pt="xs" px={rem(56)}>
          <Box
            // intentionally misalign the header to create an "optical alignment effect" (due to rounded avatar)
            ml={rem(-8)}
          >
            <Header columns={columns} icon={icon} row={rowData} />
          </Box>
        </Box>
      )}

      <Group pb={rem(48)} pt="xl" px={rem(56)}>
        <Stack gap={rem(64)} h="100%" maw={rem(900)} w="100%">
          {columns.length - headerColumns.length > 0 && (
            <DetailsGroup
              responsive
              columns={columns}
              row={rowData}
              table={table}
            />
          )}
        </Stack>
      </Group>
    </Stack>
  );
};

function useDataSample({
  databaseId,
  field,
  fieldId,
  tableId,
}: {
  databaseId: DatabaseId;
  field: Field;
  fieldId: FieldId;
  tableId: TableId;
}) {
  const reference: FieldReference = ["field", fieldId, null];
  const filter: FieldFilter = ["not-null", reference];

  const datasetQuery: DatasetQuery = {
    type: "query" as const,
    database: databaseId,
    query: {
      "source-table": tableId,
      filter,
      limit: 1,
    },
  };

  const { data: queryResult, ...rest } = useGetAdhocQueryQuery({
    ...datasetQuery,
    ignore_error: true,
    _refetchDeps: field,
  });

  const base = {
    ...rest,
    error: rest.error ? getErrorMessage(rest.error) : undefined,
    data: undefined,
    rowData: undefined,
    columns: EMPTY_COLUMNS,
  };

  if (rest?.status === "rejected" && is403Error(rest.error)) {
    return {
      ...base,
      isError: true,
      error: t`Sorry, you don't have permission to see that.`,
    };
  }

  if (queryResult?.status === "failed") {
    return {
      ...base,
      isError: true,
      error: getDataErrorMessage(queryResult),
    };
  }

  const data = queryResult?.data;
  const rowData = data?.rows[0];
  const columns = data?.cols || EMPTY_COLUMNS;

  return {
    ...rest,
    error: undefined,
    data,
    rowData,
    columns,
  };
}

export const DetailViewPreview = memo(DetailViewPreviewInner);
