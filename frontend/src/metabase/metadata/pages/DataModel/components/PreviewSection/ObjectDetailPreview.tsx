import { memo } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import EmptyState from "metabase/common/components/EmptyState";
import { DetailsGroup } from "metabase/detail-view/components";
import { Repeat, Skeleton, Stack } from "metabase/ui";
import { extractRemappedColumns } from "metabase/visualizations";
import type {
  DatabaseId,
  DatasetColumn,
  DatasetQuery,
  Field,
  FieldFilter,
  FieldId,
  FieldReference,
  RowValues,
  TableId,
} from "metabase-types/api";

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
  const { error, isFetching, columns, row } = useDataSample({
    databaseId,
    field,
    fieldId,
    tableId,
  });

  const hasData = columns != null && row != null;

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

  if (!hasData) {
    return (
      <Stack h="100%" justify="center" p="md">
        <EmptyState title={t`No data to show`} />
      </Stack>
    );
  }

  return (
    <Stack p="lg">
      <DetailsGroup columns={columns!} row={row!} table={undefined} />
    </Stack>
  );
};

function useDataSample({ databaseId, field, fieldId, tableId }: Props) {
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

  const { data, ...rest } = useGetAdhocQueryQuery({
    ...datasetQuery,
    ignore_error: true,
    _refetchDeps: field,
  });

  const base = {
    ...rest,
    error: rest.error ? getErrorMessage(rest.error) : undefined,
    columns: undefined as DatasetColumn[] | undefined,
    row: undefined as RowValues | undefined,
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
      columns: undefined,
      row: undefined,
    };
  }

  if (!data?.data) {
    return base;
  }

  const remapped = extractRemappedColumns(data.data);
  const columns: DatasetColumn[] = remapped.cols;
  const row: RowValues | undefined = remapped.rows?.[0];

  return {
    ...rest,
    error: undefined,
    columns,
    row,
  };
}

export const ObjectDetailPreview = memo(ObjectDetailPreviewBase);
