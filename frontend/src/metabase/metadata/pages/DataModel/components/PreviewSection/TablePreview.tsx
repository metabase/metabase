import { useGetAdhocQueryQuery } from "metabase/api";
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

const PREVIEW_ROW_COUNT = 5;

export function TablePreview({
  databaseId,
  tableId,
  fieldId,
}: {
  tableId: TableId;
  databaseId: DatabaseId;
  fieldId: FieldId;
}) {
  const { rawSeries } = useDataSample({
    databaseId,
    tableId,
    fieldId,
  });

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
      fields: [reference],
      filter,
      limit: PREVIEW_ROW_COUNT,
      breakout: [reference],
    },
  };

  const { data, ...rest } = useGetAdhocQueryQuery(datasetQuery);

  if (!data) {
    return { ...rest, rawSeries: undefined };
  }

  const card = {
    dataset_query: datasetQuery,
    display: "table",
    visualization_settings: {},
  } as Card;

  const rawSeries: RawSeries | undefined = data?.data && [
    { card, data: data?.data },
  ];

  return {
    ...rest,
    rawSeries,
  };
}
