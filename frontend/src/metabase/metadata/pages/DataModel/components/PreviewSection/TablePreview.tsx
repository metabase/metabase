import { useGetAdhocQueryQuery } from "metabase/api";
import Visualization from "metabase/visualizations/components/Visualization";
import type {
  Card,
  DatabaseId,
  DatasetColumn,
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

const PREVIEW_ROW_COUNT = 5;

export function TablePreview({
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

  return (
    <Visualization
      // To hide the details column
      queryBuilderMode="dataset"
      // To hide the column headers
      rawSeries={rawSeries}
    />
  );
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
  const breakout = [reference];

  const datasetQuery: DatasetQuery = {
    type: "query" as const,
    database: databaseId,
    query: {
      "source-table": tableId,
      filter,
      breakout,
      limit: PREVIEW_ROW_COUNT,
    },
  };

  const { data, ...rest } = useGetAdhocQueryQuery(datasetQuery);

  if (!data) {
    return { ...rest, error: undefined, rawSeries: undefined };
  }

  const card = {
    dataset_query: datasetQuery,
    display: "table",
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

  const { cols, rows } = data.data;

  if (cols.length === 0) {
    return { ...rest, rawSeries: undefined };
  }

  const stub: DatasetColumn = {
    name: "__metabase_generated",
    display_name: "—",
    source: "generated",
    semantic_type: "type/PK",
  };

  // create a stub column
  const c = [stub, ...cols];
  const r = rows.map((row) => ["—", ...row]);

  const rawSeries: RawSeries = [
    {
      card,
      data: {
        ...data.data,
        cols: c,
        rows: r,
      },
    },
  ];

  return {
    ...rest,
    error: undefined,
    rawSeries,
  };
}
