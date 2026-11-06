import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  DatabaseId,
  QueryTransformSource,
  TestTemplateTags,
} from "metabase-types/api";
import {
  createMockNativeDatasetQuery,
  createMockNativeQuery,
  createMockTemplateTag,
  createMockTransform,
  createMockTransformTarget,
} from "metabase-types/api/mocks";
import {
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { isMissingIncrementalTableTag } from "./utils";

const metadata = createMockMetadata({ databases: [createSampleDatabase()] });
const getMetadataProvider = (databaseId: DatabaseId | null) =>
  Lib.metadataProvider(databaseId, metadata);

const mbqlSource: QueryTransformSource = {
  type: "query",
  query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
};

function createNativeSource(
  templateTags?: TestTemplateTags,
): QueryTransformSource {
  return {
    type: "query",
    query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
      query: "SELECT * FROM table",
      templateTags,
    }),
  };
}

describe("isMissingIncrementalTableTag", () => {
  it("returns false for a non-incremental transform", () => {
    const transform = createMockTransform({
      source_type: "native",
      target: createMockTransformTarget({ type: "table" }),
    });

    expect(
      isMissingIncrementalTableTag(
        transform,
        createNativeSource(),
        getMetadataProvider,
      ),
    ).toBe(false);
  });

  it("returns false for an mbql incremental transform", () => {
    const transform = createMockTransform({
      source_type: "mbql",
      target: createMockTransformTarget({ type: "table-incremental" }),
    });

    expect(
      isMissingIncrementalTableTag(transform, mbqlSource, getMetadataProvider),
    ).toBe(false);
  });

  it("returns true when the edited native source has a non-table variable", () => {
    const source = createNativeSource({
      snippet1: { type: "snippet" },
    });

    const transform = createMockTransform({
      source_type: "native",
      target: createMockTransformTarget({ type: "table-incremental" }),
    });

    expect(
      isMissingIncrementalTableTag(transform, source, getMetadataProvider),
    ).toBe(true);
  });

  it("returns true when the edited native source has no variables", () => {
    const source = createNativeSource();

    const transform = createMockTransform({
      source_type: "native",
      target: createMockTransformTarget({ type: "table-incremental" }),
    });

    expect(
      isMissingIncrementalTableTag(transform, source, getMetadataProvider),
    ).toBe(true);
  });

  it("returns false when the edited native source still has a table variable", () => {
    const source: QueryTransformSource = {
      type: "query",
      query: createMockNativeDatasetQuery({
        database: SAMPLE_DB_ID,
        native: createMockNativeQuery({
          query: "SELECT * FROM {{my_table}}",
          "template-tags": {
            my_table: createMockTemplateTag({
              id: "1",
              name: "my_table",
              type: "table",
              "table-id": 42,
            }),
          },
        }),
      }),
    };

    const transform = createMockTransform({
      source_type: "native",
      target: createMockTransformTarget({ type: "table-incremental" }),
    });

    expect(
      isMissingIncrementalTableTag(transform, source, getMetadataProvider),
    ).toBe(false);
  });
});
