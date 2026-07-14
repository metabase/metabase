import type { SdkStore } from "embedding-sdk-bundle/store/types";
import {
  type QueryInput,
  isQueryInput,
  isQuestionInput,
  isTableInput,
} from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import { cardApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { fetchTableMetadata } from "metabase/redux/tables";
import { getMetadataUnfiltered } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import type { DatasetQuery, TestQuerySpec } from "metabase-types/api";
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
    Lib.createTestQuery(provider, { stages: [input] } satisfies TestQuerySpec),
  );
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
