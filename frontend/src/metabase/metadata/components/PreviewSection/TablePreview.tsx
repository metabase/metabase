import { memo, useMemo, useRef } from "react";
import { t } from "ttag";
import _ from "underscore";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { EmptyState } from "metabase/common/components/EmptyState";
import { useSelector } from "metabase/lib/redux";
import { getMetadataUnfiltered } from "metabase/selectors/metadata";
import { Repeat, Skeleton, Stack } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  DatabaseId,
  Field,
  FieldId,
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
  // do not generate a new query when metadata changes
  const metadata = useSelector(getMetadataUnfiltered);
  const metadataRef = useRef(metadata);
  metadataRef.current = metadata;
  const query = useMemo(
    () =>
      getPreviewQuery(
        metadataRef.current,
        databaseId,
        tableId,
        fieldId,
        pkFields,
      ),
    [databaseId, tableId, fieldId, pkFields],
  );

  const { data, refetch, ...rest } = useGetAdhocQueryQuery(
    query == null || isFieldHidden(field)
      ? skipToken
      : {
          ...Lib.toJsQuery(query),
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

  if (query == null || !data?.data || data.data.cols.length === 0) {
    return base;
  }

  const rawSeries: RawSeries = [
    {
      card: createMockCard({
        dataset_query: Lib.toJsQuery(query),
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
  metadata: Metadata,
  databaseId: DatabaseId,
  tableId: TableId,
  fieldId: FieldId,
  pkFields: Field[],
): Lib.Query | undefined {
  const metadataProvider = Lib.metadataProvider(databaseId, metadata);
  const table = Lib.tableOrCardMetadata(metadataProvider, tableId);
  const field = Lib.fieldMetadata(metadataProvider, fieldId);
  if (table == null || field == null) {
    return;
  }

  const tableQuery = Lib.queryFromTableOrCardMetadata(metadataProvider, table);
  const stageIndex = 0;
  const fieldQuery = Lib.withFields(tableQuery, stageIndex, [field]);
  const filterQuery = Lib.filter(
    fieldQuery,
    stageIndex,
    Lib.defaultFilterClause({ operator: "not-null", column: field }),
  );
  // order by PKs when possible to prevent SQL returning non-deterministically ordered values
  const orderByQuery = pkFields.reduce((query: Lib.Query, { id }: Field) => {
    const pkField = Lib.fieldMetadata(metadataProvider, Number(id));
    return pkField ? Lib.orderBy(query, stageIndex, pkField, "asc") : query;
  }, filterQuery);
  // fetch more rows to increase probability of getting at least 5 unique values
  return Lib.limit(orderByQuery, stageIndex, 50);
}

export const TablePreview = memo(TablePreviewBase);
