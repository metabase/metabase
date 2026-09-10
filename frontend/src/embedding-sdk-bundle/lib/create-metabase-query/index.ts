import type { SdkStore } from "embedding-sdk-bundle/store/types";
import {
  type QueryInput,
  isQueryInput,
  isQuestionInput,
  isTableInput,
} from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import { cardApi, selectCard, selectTableQueryMetadata } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { selectMetadataProviderUnfiltered } from "metabase/metadata-store";
import { fetchTableMetadata } from "metabase/redux/tables";
import * as Lib from "metabase-lib";
import type {
  DatasetQuery,
  TestColumnSpec,
  TestExpressionSpec,
  TestQuerySpec,
  TestStageWithSourceSpec,
} from "metabase-types/api";

import { loadReferencedMetricMetadata } from "./metric-metadata";
import { validateQueryInput } from "./validation";

export type ResolveDatasetQuery = (
  store: SdkStore,
) => (input: QueryInput) => Promise<DatasetQuery>;

export const resolveDatasetQuery: ResolveDatasetQuery =
  (store) => async (input: QueryInput) => {
    if (!isQueryInput(input)) {
      throw new Error(
        'Query object creation requires a source reference like `{ type: "table", id }` or `{ type: "card", id }`.',
      );
    }

    validateQueryInput(input);

    await loadSourceMetadata(store, input);

    return resolveQueryFromLoadedMetadata(input, store.getState());
  };

type SdkState = ReturnType<SdkStore["getState"]>;

function resolveQueryFromLoadedMetadata(input: QueryInput, state: SdkState) {
  if (!isQueryInput(input)) {
    throw new Error(
      'Query object creation requires a source reference like `{ type: "table", id }` or `{ type: "card", id }`.',
    );
  }

  const databaseId = getSourceDatabaseId(input, state);
  const provider = selectMetadataProviderUnfiltered(state, databaseId);

  return Lib.toJsQuery(
    Lib.createTestQuery(provider, {
      stages: [toStageSpec(input)],
    } satisfies TestQuerySpec),
  );
}

function toStageSpec(input: QueryInput): TestStageWithSourceSpec {
  if (!isQuestionInput(input)) {
    return input;
  }

  const { source, filters, aggregations, breakouts, orderBys, limit } = input;

  return {
    source: { type: "card", id: source.id },
    ...(filters && { filters: filters.map(toResultColumnExpressionSpec) }),
    ...(aggregations && {
      aggregations: aggregations.map(toResultColumnExpressionSpec),
    }),
    ...(breakouts && { breakouts: breakouts.map(toResultColumnSpec) }),
    ...(orderBys && { orderBys: orderBys.map(toResultColumnSpec) }),
    ...(limit != null && { limit }),
  };
}

// A card stage exposes the saved question's result columns, so they are looked
// up by name. Keys that scope a column to a table narrow that lookup and stop
// it matching, so drop them from generated table fields used as result columns.
function toResultColumnSpec<TSpec extends TestColumnSpec>(spec: TSpec) {
  const {
    tableId: _tableId,
    sourceName: _sourceName,
    sourceFieldId: _sourceFieldId,
    displayName: _displayName,
    ...resultColumn
  } = spec;

  return resultColumn;
}

function toResultColumnExpressionSpec(
  spec: TestExpressionSpec,
): TestExpressionSpec {
  if (spec.type === "column") {
    return toResultColumnSpec(spec);
  }

  if (spec.type === "operator") {
    return { ...spec, args: spec.args?.map(toResultColumnExpressionSpec) };
  }

  return spec;
}

async function loadSourceMetadata(store: SdkStore, input: QueryInput) {
  if (input.source.type === "card") {
    await loadCardMetadata(store, input.source.id);
    return;
  }

  if (isTableInput(input)) {
    await store.dispatch(fetchTableMetadata({ id: input.source.id }));
    await loadReferencedMetricMetadata(store, input);
  }
}

async function loadCardMetadata(store: SdkStore, id: number) {
  await Promise.all([
    runRtkEndpoint({ id }, store.dispatch, cardApi.endpoints.getCard, {
      forceRefetch: false,
    }),
    runRtkEndpoint(id, store.dispatch, cardApi.endpoints.getCardQueryMetadata, {
      forceRefetch: false,
    }),
  ]);
}

function getSourceDatabaseId(input: QueryInput, state: SdkState) {
  if (isTableInput(input)) {
    return getTableDatabaseId(input.source.id, state);
  }

  if (isQuestionInput(input)) {
    return getCardDatabaseId(input.source.id, state);
  }

  throw new Error("Unable to find database for query source.");
}

// Both sources were awaited by `loadSourceMetadata`, so they are in the RTK
// cache by now.
function getTableDatabaseId(tableId: number, state: SdkState) {
  const { data: table } = selectTableQueryMetadata({ id: tableId })(state);

  if (typeof table?.db_id === "number") {
    return table.db_id;
  }

  throw new Error(`Unable to find database for table ${tableId}.`);
}

function getCardDatabaseId(cardId: number, state: SdkState) {
  const { data: card } = selectCard({ id: cardId })(state);
  const databaseId = card?.dataset_query?.database;

  if (typeof databaseId === "number") {
    return databaseId;
  }

  throw new Error(`Unable to find database for saved question ${cardId}.`);
}
