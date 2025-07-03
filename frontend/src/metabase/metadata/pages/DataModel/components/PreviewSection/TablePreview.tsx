import { memo } from "react";
import _ from "underscore";

import { useGetAdhocQueryQuery } from "metabase/api";
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
import { getErrorMessage } from "./utils";

const PREVIEW_ROW_COUNT = 5;

interface Props {
  databaseId: DatabaseId;
  field: Field;
  fieldId: FieldId;
  tableId: TableId;
}

const TablePreviewBase = (props: Props) => {
  const { error, isFetching, rawSeries } = useDataSample(props);

  if (isFetching) {
    return (
      <Stack data-testid="loading-indicator" gap="sm" p="xs">
        <Skeleton h="2rem" w="6rem" />

        <Repeat times={5}>
          <Skeleton h="1.5rem" w="10rem" />
        </Repeat>
      </Stack>
    );
  }

  if (error) {
    return <Error message={error} />;
  }

  return (
    <Visualization
      // Setting queryBuilderMode to dataset will hide the object detail
      // expander column, which we don't want in this case
      queryBuilderMode="dataset"
      rawSeries={rawSeries}
    />
  );
};

function useDataSample({ databaseId, field, fieldId, tableId }: Props) {
  const datasetQuery = getPreviewQuery(databaseId, tableId, fieldId);

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

  const rawSeries: RawSeries = [
    {
      card: createMockCard({
        dataset_query: datasetQuery,
        display: "table",
        visualization_settings: {},
      }),
      data: {
        ...data.data,
        rows: _.uniq(data.data.rows).slice(0, PREVIEW_ROW_COUNT),
      },
    },
  ];

  return { ...base, rawSeries };
}

function getPreviewQuery(
  databaseId: DatabaseId,
  tableId: TableId,
  fieldId: FieldId,
): DatasetQuery {
  const fieldRef: FieldReference = ["field", fieldId, null];
  const filter: FieldFilter = ["not-null", fieldRef];

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

export const TablePreview = memo(TablePreviewBase);
