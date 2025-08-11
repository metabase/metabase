import { memo } from "react";
import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import EmptyState from "metabase/common/components/EmptyState";
import { Repeat, Skeleton, Stack } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type {
  DatabaseId,
  DatasetQuery,
  Field,
  FieldFilter,
  FieldId,
  FieldReference,
  RawSeries,
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
  const zoomedRow = data?.rows[0];

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

  if (!data || !zoomedRow) {
    return (
      <Stack h="100%" justify="center" p="md">
        <EmptyState title={t`No data to show`} />
      </Stack>
    );
  }

  return <Visualization rawSeries={rawSeries} />;
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

  if (!data?.data) {
    return base;
  }

  const rawSeries: RawSeries = [
    {
      card: createMockCard({
        dataset_query: datasetQuery,
        display: "object",
        visualization_settings: {},
      }),
      data: data.data,
    },
  ];

  return {
    ...rest,
    error: undefined,
    rawSeries,
  };
}

export const ObjectDetailPreview = memo(ObjectDetailPreviewBase);
