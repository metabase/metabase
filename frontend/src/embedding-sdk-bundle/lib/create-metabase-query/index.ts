import type { SdkStore } from "embedding-sdk-bundle/store/types";
import {
  type DynamicQueryInput,
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
  TestStageSpec,
  TestStageWithSourceSpec,
} from "metabase-types/api";

import { loadReferencedMetricMetadata } from "./metric-metadata";
import { validateDynamicQuery, validateQueryInput } from "./validation";

export type ResolveDatasetQuery = (
  store: SdkStore,
) => (
  input: QueryInput,
  dynamicQuery?: DynamicQueryInput,
) => Promise<DatasetQuery>;

export const resolveDatasetQuery: ResolveDatasetQuery =
  (store) => async (input: QueryInput, dynamicQuery?: DynamicQueryInput) => {
    if (!isQueryInput(input)) {
      throw new Error(
        'Query object creation requires a source reference like `{ type: "table", id }` or `{ type: "card", id }`.',
      );
    }

    validateQueryInput(input);
    validateDynamicQuery(dynamicQuery);

    await loadSourceMetadata(store, input);

    return resolveQueryFromLoadedMetadata(
      input,
      dynamicQuery,
      store.getState(),
    );
  };

type SdkState = ReturnType<SdkStore["getState"]>;

function resolveQueryFromLoadedMetadata(
  input: QueryInput,
  dynamicQuery: DynamicQueryInput | undefined,
  state: SdkState,
) {
  if (!isQueryInput(input)) {
    throw new Error(
      'Query object creation requires a source reference like `{ type: "table", id }` or `{ type: "card", id }`.',
    );
  }

  const databaseId = getSourceDatabaseId(input, state);
  const provider = selectMetadataProviderUnfiltered(state, databaseId);
  const sourceStage = toStageSpec(input);

  const datasetQuery = Lib.toJsQuery(
    Lib.createTestQuery(provider, {
      // The dynamic clauses run as their own stage rather than merging into the
      // source stage. Merged, they would apply before the static aggregation on
      // a table source but after it on the published card — the same app would
      // return different numbers in the dev preview and in production.
      stages: dynamicQuery
        ? [sourceStage, toResultColumnStageSpec(dynamicQuery)]
        : [sourceStage],
    } satisfies TestQuerySpec),
  );

  // Lib reads the database off the metadata provider, and a user who may read a
  // card but not create queries gets none from `/api/card/:id/query_metadata` —
  // so the query comes back without `:database`, which `/api/dataset` rejects.
  // The source itself carries the id, so set it explicitly.
  return { ...datasetQuery, database: databaseId };
}

function toStageSpec(input: QueryInput): TestStageWithSourceSpec {
  if (!isQuestionInput(input)) {
    return input;
  }

  return {
    source: { type: "card", id: input.source.id },
    ...toResultColumnStageSpec(input),
  };
}

/**
 * A stage whose dimensions are the previous stage's result columns — a card
 * stage or a dynamic stage. Both resolve their columns by name.
 */
function toResultColumnStageSpec({
  filters,
  aggregations,
  breakouts,
  orderBys,
  limit,
}: DynamicQueryInput): TestStageSpec {
  return {
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
// up by name. `sourceName` and `displayName` describe the table field rather
// than the result column and stop it matching, so they are dropped. `tableId`
// and `sourceFieldId` stay: a result column keeps both, and they tell it apart
// from a same-named column reachable through an FK.
function toResultColumnSpec<TSpec extends TestColumnSpec>(spec: TSpec) {
  const {
    sourceName: _sourceName,
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
