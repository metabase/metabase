import type { SdkStore } from "embedding-sdk-bundle/store/types";
import { isTableInput } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import { fetchTableMetadata } from "metabase/redux/tables";
import { getMetadataUnfiltered } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import type { DatasetQuery, TestQuerySpec } from "metabase-types/api";

import type { TableQueryInput } from "./input-types";
import { validateTableQueryInput } from "./validation";

export type CreateMetabaseQuery = (
  store: SdkStore,
) => (input: TableQueryInput) => Promise<DatasetQuery>;

export const createMetabaseQuery: CreateMetabaseQuery =
  (store) => async (input: TableQueryInput) => {
    if (!isTableInput(input)) {
      throw new Error(
        "Table query object creation requires a source reference with id and databaseId.",
      );
    }

    validateTableQueryInput(input);

    await store.dispatch(fetchTableMetadata({ id: input.source.id }));

    return createQueryFromLoadedMetadata(
      input,
      getMetadataUnfiltered(store.getState()),
    );
  };

function createQueryFromLoadedMetadata(
  input: TableQueryInput,
  metadata: Lib.Metadata,
) {
  if (!isTableInput(input)) {
    throw new Error(
      "Table query object creation requires a source reference with id and databaseId.",
    );
  }

  const provider = Lib.metadataProvider(input.source.databaseId, metadata);
  const { enabled: _enabled, source, ...stage } = input;

  return Lib.toJsQuery(
    Lib.createTestQuery(provider, {
      stages: [{ ...stage, source: { type: "table", id: source.id } }],
    } satisfies TestQuerySpec),
  );
}
