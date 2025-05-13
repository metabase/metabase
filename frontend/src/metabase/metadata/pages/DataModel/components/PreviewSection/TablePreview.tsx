import { useGetAdhocQueryQuery } from "metabase/api";
import Visualization from "metabase/visualizations/components/Visualization";
import type {
  Card,
  DatabaseId,
  FieldFilter,
  FieldId,
  FieldReference,
  RawSeries,
  TableId,
} from "metabase-types/api";

const NO_HEADER = () => "";

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
      renderTableHeader={NO_HEADER}
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
  const datasetQuery = {
    type: "query" as const,
    database: databaseId,
    query: {
      "source-table": tableId,
      fields: [reference],
      filter,
      limit: 10,
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
