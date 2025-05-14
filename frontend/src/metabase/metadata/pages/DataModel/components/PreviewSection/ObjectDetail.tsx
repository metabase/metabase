import { t } from "ttag";

import { useGetAdhocQueryQuery } from "metabase/api";
import EmptyState from "metabase/components/EmptyState";
import { Stack } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type {
  Card,
  DatabaseId,
  DatasetQuery,
  Field,
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
  field,
}: {
  tableId: TableId;
  databaseId: DatabaseId;
  fieldId: FieldId;
  field: Field;
}) {
  const { rawSeries, error } = useDataSample({
    databaseId,
    tableId,
    fieldId,
    field,
  });

  if (error) {
    return <Error error={error} />;
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
  field,
}: {
  databaseId: DatabaseId;
  tableId: TableId;
  fieldId: FieldId;
  field: Field;
}) {
  let options = null;
  if (field.base_type === "type/DateTime") {
    options = {
      "base-type": "type/DateTime",
      "temporal-unit": "minute" as const,
    };
  }

  const reference: FieldReference = ["field", fieldId, options];
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

  if (!data) {
    return { ...rest, error: undefined, rawSeries: undefined };
  }

  const card = {
    dataset_query: datasetQuery,
    display: "object",
    visualization_settings: {},
  } as Card;

  if (!data?.data) {
    return { ...rest, error: undefined, rawSeries: undefined };
  }

  if (data.status === "failed") {
    return {
      ...rest,
      rawSeries: undefined,
      isError: true,
      error: getErrorMessage(data),
    };
  }

  const rawSeries: RawSeries = [
    {
      card,
      data: data.data,
    },
  ];

  return {
    ...rest,
    error: undefined,
    rawSeries,
  };
}
