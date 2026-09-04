import type { SdkStore } from "embedding-sdk-bundle/store/types";
import {
  type QueryInput,
  isQueryInput,
  isQuestionInput,
  isTableInput,
} from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import { cardApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { getMetadataUnfiltered } from "metabase/metadata-store";
import { fetchTableMetadata } from "metabase/redux/tables";
import * as Lib from "metabase-lib";
import type {
  DatasetQuery,
  TestColumnSpec,
  TestExpressionSpec,
  TestQuerySpec,
  TestStageWithSourceSpec,
} from "metabase-types/api";
import { isObject } from "metabase-types/guards";

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

    return resolveQueryFromLoadedMetadata(
      input,
      getMetadataUnfiltered(store.getState()),
    );
  };

function resolveQueryFromLoadedMetadata(
  input: QueryInput,
  metadata: Lib.Metadata,
) {
  if (!isQueryInput(input)) {
    throw new Error(
      'Query object creation requires a source reference like `{ type: "table", id }` or `{ type: "card", id }`.',
    );
  }

  const databaseId = getSourceDatabaseId(input, metadata);
  const provider = Lib.metadataProvider(databaseId, metadata);

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
