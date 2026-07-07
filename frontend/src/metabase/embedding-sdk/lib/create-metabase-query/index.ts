import { isTableInput } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import * as Lib from "metabase-lib";
import type { DatasetQuery, TestQuerySpec } from "metabase-types/api";

import type { TableQueryInput } from "./input-types";
import { createTableMetadata } from "./lib-adapter/metadata";
import { validateTableQueryInput } from "./validation";

export type CreateMetabaseQuery = (input: TableQueryInput) => DatasetQuery;

export const createMetabaseQuery: CreateMetabaseQuery = (
  input: TableQueryInput,
) => {
  if (!isTableInput(input)) {
    throw new Error(
      "Table query object creation requires a source reference with id and databaseId.",
    );
  }

  validateTableQueryInput(input);

  const provider = Lib.metadataProvider(
    input.source.databaseId,
    createTableMetadata(input.source, input.source.databaseId),
  );

  return Lib.toJsQuery(
    Lib.createTestQuery(provider, { stages: [input] } satisfies TestQuerySpec),
  );
};
