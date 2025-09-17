import { memo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import EmptyState from "metabase/common/components/EmptyState";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
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

import { HiddenFieldEmptyStateBlock } from "./EmptyStateBlock";
import { Error } from "./Error";
import { getDataErrorMessage, is403Error, isFieldHidden } from "./utils";

const PREVIEW_ROW_COUNT = 5;

interface Props {
  databaseId: DatabaseId;
  field: Field;
  fieldId: FieldId;
  pkFields: Field[];
  tableId: TableId;
}

const TablePreviewBase = (props: Props) => {
  const { field } = props;
  const { error, isFetching, rawSeries } = useDataSample(props);
  const data = rawSeries?.[0]?.data?.rows;

  if (isFieldHidden(field)) {
    return <HiddenFieldEmptyStateBlock />;
  }

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

  if (!data || data.length === 0) {
    return (
      <Stack h="100%" justify="center" p="md">
        <EmptyState title={t`No data to show`} />
      </Stack>
    );
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

function useDataSample({
  databaseId,
  field,
  fieldId,
  pkFields,
  tableId,
}: Props) {
  const datasetQuery = getPreviewQuery(databaseId, tableId, fieldId, pkFields);

  const { data, refetch, ...rest } = useGetAdhocQueryQuery(
    isFieldHidden(field)
      ? skipToken
      : {
          ...datasetQuery,
          ignore_error: true,
          _refetchDeps: field,
        },
  );
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
    return { ...base, isError: true, error: getDataErrorMessage(data) };
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
  pkFields: Field[],
): DatasetQuery {
  const fieldRef: FieldReference = ["field", fieldId, null];
  const pkFieldRefs: FieldReference[] = pkFields.map((pkField) => {
    return ["field", getRawTableFieldId(pkField), null];
  });
  const filter: FieldFilter = ["not-null", fieldRef];

  return {
    type: "query",
    database: databaseId,
    query: {
      "source-table": tableId,
      filter,
      fields: [fieldRef],
      // fetch more rows to increase probability of getting at least 5 unique values
      limit: 50,
      // order by PKs when possible to prevent SQL returning non-deterministically ordered values
      "order-by": pkFieldRefs.map((pkFieldRef) => ["asc", pkFieldRef]),
    },
  };
}

export const TablePreview = memo(TablePreviewBase);
