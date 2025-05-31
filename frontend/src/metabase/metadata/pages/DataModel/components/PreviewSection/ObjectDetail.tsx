import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import EmptyState from "metabase/components/EmptyState";
import { Stack } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type {
  Card,
  DatabaseId,
  DatasetQuery,
  FieldFilter,
  FieldId,
  FieldReference,
  RawSeries,
  TableId,
} from "metabase-types/api";

import { Error } from "./Error";
import { getErrorMessage } from "./utils";

export function ObjectDetailPreview({
  databaseId,
  tableId,
  fieldId,
}: {
  tableId: TableId;
  databaseId: DatabaseId;
  fieldId: FieldId;
}) {
  const { rawSeries, error } = useDataSample({
    databaseId,
    tableId,
    fieldId,
  });

  if (error) {
    return <Error message={error} />;
  }

  const data = rawSeries?.[0]?.data;
  const zoomedRow = data?.rows[0];

  if (!data || !zoomedRow) {
    return (
      <Stack h="100%" justify="center" p="md">
        <EmptyState title={t`No data to show.`} />
      </Stack>
    );
  }

  return <Visualization rawSeries={rawSeries} />;
}

function useDataSample({
  databaseId,
  tableId,
  fieldId,
}: {
  databaseId: DatabaseId;
  tableId: TableId;
  fieldId: FieldId;
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

  const { data, ...rest } = useGetAdhocQueryQuery(datasetQuery);

  const base = { ...rest, error: undefined, rawSeries: undefined };

  if (data?.status === "failed") {
    return {
      ...rest,
      rawSeries: undefined,
      isError: true,
      error: getErrorMessage(data),
    };
  }

  if (!data?.data) {
    return base;
  }

  const rawSeries: RawSeries = [
    {
      card: {
        dataset_query: datasetQuery,
        display: "object",
        visualization_settings: {},
      } as Card,
      data: data.data,
    },
  ];

  return {
    ...rest,
    error: undefined,
    rawSeries,
  };
}
