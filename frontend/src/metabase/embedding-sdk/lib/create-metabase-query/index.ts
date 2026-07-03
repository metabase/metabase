import type { SdkStore } from "embedding-sdk-bundle/store/types";
import {
  isQueryInput,
  isTableInput,
} from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import { cardApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { fetchTableMetadata } from "metabase/redux/tables";
import { getMetadataUnfiltered } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import type { DatasetQuery, TestQuerySpec } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import type { QueryInput } from "./input-types";
import { validateQueryInput } from "./validation";

export type ResolveDatasetQuery = (
  store: SdkStore,
) => (input: QueryInput) => Promise<DatasetQuery>;

export const resolveDatasetQuery: ResolveDatasetQuery =
  (store) => async (input: QueryInput) => {
    if (!isQueryInput(input)) {
      throw new Error(
        'Query object creation requires a source reference like `{ type: "table", id }` or `{ type: "metric", id }`.',
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
      'Query object creation requires a source reference like `{ type: "table", id }` or `{ type: "metric", id }`.',
    );
  }

  const databaseId = getSourceDatabaseId(input, metadata);
  const provider = Lib.metadataProvider(databaseId, metadata);

  return Lib.toJsQuery(
    Lib.createTestQuery(provider, { stages: [input] } satisfies TestQuerySpec),
  );
}

async function loadSourceMetadata(store: SdkStore, input: QueryInput) {
  if (isTableInput(input)) {
    await store.dispatch(fetchTableMetadata({ id: input.source.id }));
    return;
  }

  await runRtkEndpoint(
    { id: input.source.id },
    store.dispatch,
    cardApi.endpoints.getCard,
    { forceRefetch: false },
  );
  await runRtkEndpoint(
    input.source.id,
    store.dispatch,
    cardApi.endpoints.getCardQueryMetadata,
    { forceRefetch: false },
  );
}

function getSourceDatabaseId(input: QueryInput, metadata: Lib.Metadata) {
  if (isTableInput(input)) {
    return getTableDatabaseId(input.source.id, metadata);
  }

  if (typeof input.source.databaseId === "number") {
    return input.source.databaseId;
  }

  if (typeof input.source.sourceTableId === "number") {
    return getTableDatabaseId(input.source.sourceTableId, metadata);
  }

  throw new Error(`Unable to find database for Metric ${input.source.id}.`);
}

function getTableDatabaseId(tableId: number, metadata: Lib.Metadata) {
  const table = metadata.tables?.[tableId];

  if (isObject(table) && typeof table.db_id === "number") {
    return table.db_id;
  }

  throw new Error(`Unable to find database for table ${tableId}.`);
}
