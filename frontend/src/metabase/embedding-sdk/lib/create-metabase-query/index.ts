import type { SdkStore } from "embedding-sdk-bundle/store/types";
import {
  type TableQueryInput,
  isQueryInput,
} from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import { fetchTableMetadata } from "metabase/redux/tables";
import { getMetadataUnfiltered } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import type { DatasetQuery, TestQuerySpec } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { loadReferencedMetricMetadata } from "./metric-metadata";
import { validateQueryInput } from "./validation";

export type ResolveDatasetQuery = (
  store: SdkStore,
) => (input: TableQueryInput) => Promise<DatasetQuery>;

export const resolveDatasetQuery: ResolveDatasetQuery =
  (store) => async (input: TableQueryInput) => {
    if (!isQueryInput(input)) {
      throw new Error(
        'Query object creation requires a source reference like `{ type: "table", id }`.',
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
  input: TableQueryInput,
  metadata: Lib.Metadata,
) {
  if (!isQueryInput(input)) {
    throw new Error(
      'Query object creation requires a source reference like `{ type: "table", id }`.',
    );
  }

  const databaseId = getTableDatabaseId(input.source.id, metadata);
  const provider = Lib.metadataProvider(databaseId, metadata);

  return Lib.toJsQuery(
    Lib.createTestQuery(provider, { stages: [input] } satisfies TestQuerySpec),
  );
}

async function loadSourceMetadata(store: SdkStore, input: TableQueryInput) {
  await store.dispatch(fetchTableMetadata({ id: input.source.id }));
  await loadReferencedMetricMetadata(store, input);
}

function getTableDatabaseId(tableId: number, metadata: Lib.Metadata) {
  const table = metadata.tables?.[tableId];

  if (isObject(table) && typeof table.db_id === "number") {
    return table.db_id;
  }

  throw new Error(`Unable to find database for table ${tableId}.`);
}
