import _ from "underscore";

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
  RowValues,
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
  const datasetQuery = getPreviewQuery(field, fieldId, databaseId, tableId);

  const { data, refetch, ...rest } = useGetAdhocQueryQuery({
    ...datasetQuery,
    _refetchDeps: field,
  });

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
        rows: getDistinctRows(data.data.rows.map((row) => [stubValue, ...row])),
      },
    },
  ];

  return { ...base, rawSeries };
}

function getPreviewQuery(
  field: Field,
  fieldId: number,
  databaseId: number,
  tableId: TableId,
): DatasetQuery {
  const fieldRef: FieldReference = ["field", fieldId, null];
  const filter: FieldFilter = ["not-null", fieldRef];

  if (isa(field.base_type, TYPE.DateTime)) {
    /**
     * Date-time columns get slightly different treatment because breaking out on a date-time column will:
     * - truncate information about seconds and milliseconds (minute is the most granular binning
     *   that QP supports), which prevents time formatting settings from having an effect on the preview
     *   when choosing to show seconds or milliseconds
     * - add a suffix (bin size) to column name (though it could be worked around with viz settings)
     */
    return {
      type: "query",
      database: databaseId,
      query: {
        "source-table": tableId,
        filter,
        fields: [fieldRef],
        limit: 50, // fetch more rows to increase probability of getting at least 5 unique values
      },
    };
  }

  return {
    type: "query",
    database: databaseId,
    query: {
      "source-table": tableId,
      filter,
      breakout: [fieldRef], // breakout to ensure distinct values
      limit: PREVIEW_ROW_COUNT,
    },
  };
}

function getDistinctRows(rows: RowValues[]) {
  const distinctRows = _.uniq(rows, ([_stubValue, value]) => value);
  return distinctRows.slice(0, PREVIEW_ROW_COUNT);
}
