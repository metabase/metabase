import { memo, useMemo } from "react";
import { t } from "ttag";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import EmptyState from "metabase/common/components/EmptyState";
import { DetailsGroup, Header } from "metabase/detail-view/components";
import { getEntityIcon, getHeaderColumns } from "metabase/detail-view/utils";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Repeat, Skeleton, Stack, rem } from "metabase/ui";
import { extractRemappedColumns } from "metabase/visualizations";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  DatabaseId,
  DatasetColumn,
  Field,
  FieldId,
  RawSeries,
  RowValues,
  TableId,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

import { Error } from "./Error";
import { getDataErrorMessage, is403Error } from "./utils";

interface Props {
  databaseId: DatabaseId;
  field: Field;
  fieldId: FieldId;
  tableId: TableId;
}

const ObjectDetailPreviewBase = ({
  databaseId,
  field,
  fieldId,
  tableId,
}: Props) => {
  const { error, isFetching, rawSeries } = useDataSample({
    databaseId,
    field,
    fieldId,
    tableId,
  });

  const data = rawSeries?.[0]?.data;
  const columns: DatasetColumn[] = useMemo(
    () => data?.cols ?? [],
    [data?.cols],
  );
  const row: RowValues | undefined = data?.rows[0];

  const headerColumns = useMemo(() => getHeaderColumns(columns), [columns]);
  const icon = getEntityIcon(field.table?.entity_type);

  if (isFetching) {
    return (
      <Stack data-testid="loading-indicator" gap="sm" p="lg">
        <Repeat times={5}>
          <Skeleton h="2.5rem" />
        </Repeat>
      </Stack>
    );
  }

  if (error) {
    return <Error message={error} />;
  }

  if (!data || !row || columns.length === 0) {
    return (
      <Stack h="100%" justify="center" p="md">
        <EmptyState title={t`No data to show`} />
      </Stack>
    );
  }

  return (
    <Stack gap={0} p="lg">
      {headerColumns.length > 0 && (
        <Box pb="md" pt="xs">
          <Box ml={rem(-8)}>
            <Header columns={columns} icon={icon} row={row} />
          </Box>
        </Box>
      )}

      {columns.length > 0 && (
        <Box pt="xl">
          <DetailsGroup
            columns={columns}
            row={row}
            table={field.table}
            responsive
          />
        </Box>
      )}
    </Stack>
  );
};

function getSampleQuery(
  metadata: Metadata,
  databaseId: DatabaseId,
  tableId: TableId,
  fieldId: FieldId,
) {
  const metadataProvider = Lib.metadataProvider(databaseId, metadata);
  const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, tableId);
  const fieldMetadata = Lib.fieldMetadata(metadataProvider, fieldId);
  if (tableMetadata == null || fieldMetadata == null) {
    return;
  }

  return Lib.filter(
    Lib.queryFromTableOrCardMetadata(metadataProvider, tableMetadata),
    0,
    Lib.defaultFilterClause({
      operator: "not-null",
      column: fieldMetadata,
    }),
  );
}

function useDataSample({ databaseId, field, fieldId, tableId }: Props) {
  const metadata = useSelector(getMetadata);
  const query = useMemo(
    () => getSampleQuery(metadata, databaseId, tableId, fieldId),
    [metadata, databaseId, tableId, fieldId],
  );

  const { data, ...rest } = useGetAdhocQueryQuery(
    query
      ? {
          ...Lib.toJsQuery(query),
          ignore_error: true,
          _refetchDeps: field,
        }
      : skipToken,
  );

  const base = {
    ...rest,
    error: rest.error ? getErrorMessage(rest.error) : undefined,
    rawSeries: undefined,
  };

  if (rest?.status === "rejected" && is403Error(rest.error)) {
    return {
      ...base,
      isError: true,
      error: t`Sorry, you don’t have permission to see that.`,
    };
  }

  if (data?.status === "failed") {
    return {
      ...rest,
      error: getDataErrorMessage(data),
      isError: true,
      rawSeries: undefined,
    };
  }

  if (data?.data == null || query == null) {
    return base;
  }

  const rawSeries: RawSeries = [
    {
      card: createMockCard({
        dataset_query: Lib.toJsQuery(query),
        display: "object",
        visualization_settings: {},
      }),
      data: extractRemappedColumns(data.data),
    },
  ];

  return {
    ...rest,
    error: undefined,
    rawSeries,
  };
}

export const ObjectDetailPreview = memo(ObjectDetailPreviewBase);
