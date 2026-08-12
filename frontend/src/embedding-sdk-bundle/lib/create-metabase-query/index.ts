import type { SdkStore } from "embedding-sdk-bundle/store/types";
import {
  type DynamicQueryInput,
  type QueryInput,
  isQueryInput,
  isQuestionInput,
  isTableInput,
} from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import { cardApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { isDataAppDev } from "metabase/embedding-sdk/config";
import { getMetadataUnfiltered } from "metabase/metadata-store";
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
import { isObject } from "metabase-types/guards";

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

    const sourceInput = toSourceInput(input);

    validateQueryInput(sourceInput);
    validateDynamicQuery(dynamicQuery);

    await loadSourceMetadata(store, sourceInput);

    return resolveQueryFromLoadedMetadata(
      sourceInput,
      dynamicQuery,
      getMetadataUnfiltered(store.getState()),
    );
  };

/**
 * The query whose source actually runs. Outside the dev preview a published card
 * replaces the table source: the card is what grants an app's viewers permission
 * to run the query, through the collection it lives in. Its static clauses are
 * already baked into the card, so only the source and the dynamic stage remain.
 */
function toSourceInput(input: QueryInput): QueryInput {
  if (
    !isTableInput(input) ||
    input.savedQuestionSourceId == null ||
    // We need to do the swap only for production data apps
    isDataAppDev()
  ) {
    return input;
  }

  return { source: { type: "card", id: input.savedQuestionSourceId } };
}

function resolveQueryFromLoadedMetadata(
  input: QueryInput,
  dynamicQuery: DynamicQueryInput | undefined,
  metadata: Lib.Metadata,
) {
  const databaseId = getSourceDatabaseId(input, metadata);
  const provider = Lib.metadataProvider(databaseId, metadata);
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

function getSourceDatabaseId(input: QueryInput, metadata: Lib.Metadata) {
  if (isTableInput(input)) {
    return getTableDatabaseId(input.source.id, metadata);
  }

  if (isQuestionInput(input)) {
    return getCardDatabaseId(input.source.id, metadata);
  }

  throw new Error("Unable to find database for query source.");
}

function getTableDatabaseId(tableId: number, metadata: Lib.Metadata) {
  const table = metadata.tables?.[tableId];

  if (isObject(table) && typeof table.db_id === "number") {
    return table.db_id;
  }

  throw new Error(`Unable to find database for table ${tableId}.`);
}

function getCardDatabaseId(cardId: number, metadata: Lib.Metadata) {
  const card = metadata.questions?.[cardId];
  const datasetQuery = getCardDatasetQuery(card);

  if (isObject(datasetQuery) && typeof datasetQuery.database === "number") {
    return datasetQuery.database;
  }

  throw new Error(`Unable to find database for saved question ${cardId}.`);
}

function getCardDatasetQuery(card: unknown) {
  if (!isObject(card)) {
    return null;
  }

  if (isObject(card.dataset_query)) {
    return card.dataset_query;
  }

  if (typeof card.datasetQuery === "function") {
    return card.datasetQuery();
  }

  return null;
}
