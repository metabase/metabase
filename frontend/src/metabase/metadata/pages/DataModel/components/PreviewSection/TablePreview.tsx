import { useGetAdhocQueryQuery } from "metabase/api";
import Visualization from "metabase/visualizations/components/Visualization";
import { TYPE } from "metabase-lib/v1/types/constants";
import { isa } from "metabase-lib/v1/types/utils/isa";
import type {
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
import { createMockCard } from "metabase-types/api/mocks";

import { Error } from "./Error";
import { getErrorMessage } from "./utils";

const PREVIEW_ROW_COUNT = 5;

interface Props {
  databaseId: DatabaseId;
  field: Field;
  fieldId: FieldId;
  tableId: TableId;
}

export function TablePreview(props: Props) {
  const { error, rawSeries } = useDataSample(props);

  if (error) {
    return <Error message={error} />;
  }

  return (
    <Visualization
      // Setting queryBuilderMode to dataset will hide the object detail
      // expaner column, which we don't want in this case
      queryBuilderMode="dataset"
      rawSeries={rawSeries}
    />
  );
}

function useDataSample({ databaseId, field, fieldId, tableId }: Props) {
  const options = isa(field.base_type, TYPE.DateTime)
    ? {
        "base-type": "type/DateTime",
        "temporal-unit": "minute" as const,
      }
    : null;
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
      card: createMockCard({
        dataset_query: datasetQuery,
        display: "table",
        visualization_settings: {},
      }),
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
