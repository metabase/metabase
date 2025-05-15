import { useGetAdhocQueryQuery } from "metabase/api";
import Visualization from "metabase/visualizations/components/Visualization";
import { TYPE } from "metabase-lib/v1/types/constants";
import { isa } from "metabase-lib/v1/types/utils/isa";
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

type TablePreviewProps = {
  fieldId: FieldId;
  databaseId: DatabaseId;
  tableId: TableId;
  field: Field;
};

export function TablePreview(props: TablePreviewProps) {
  const { rawSeries, error } = useDataSample(props);

  if (error) {
    return <Error message={error} />;
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
  fieldId,
  tableId,
  databaseId,
  field,
}: TablePreviewProps) {
  let options = null;
  if (isa(field.base_type, TYPE.DateTime)) {
    options = {
      "base-type": "type/DateTime",
      "temporal-unit": "minute" as const,
    };
  }

  const fieldRef: FieldReference = ["field", fieldId, options];
  const filter: FieldFilter = ["not-null", fieldRef];
  const breakout = [fieldRef];

  const datasetQuery: DatasetQuery = {
    type: "query",
    database: databaseId,
    query: {
      "source-table": tableId,
      filter,
      breakout,
      limit: PREVIEW_ROW_COUNT,
    },
  };

  const { data, ...rest } = useGetAdhocQueryQuery(datasetQuery);

  const base = { ...rest, error: undefined, rawSeries: undefined };

  if (data?.status === "failed") {
    return { ...base, isError: true, error: getErrorMessage(data) };
  }

  if (!data?.data || data.data.cols.length === 0) {
    return base;
  }

  const stubColumn: DatasetColumn = {
    name: "__metabase_generated",
    display_name: "—",
    source: "generated",
    semantic_type: "type/PK",
  };
  const stubValue = "—";

  const rawSeries: RawSeries = [
    {
      card: {
        dataset_query: datasetQuery,
        display: "table",
        visualization_settings: {},
      } as Card,
      data: {
        // create a stub column in the data
        ...data.data,
        cols: [stubColumn, ...data.data.cols],
        rows: data.data.rows.map((row) => [stubValue, ...row]),
      },
    },
  ];

  return { ...base, rawSeries };
}
