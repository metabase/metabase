import { createMockMetadata } from "__support__/metadata";
import type { QueryTransformSource, TemplateTags } from "metabase-types/api";
import {
  createMockNativeDatasetQuery,
  createMockNativeQuery,
  createMockStructuredDatasetQuery,
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

const mbqlSource: QueryTransformSource = {
  type: "query",
  query: createMockStructuredDatasetQuery({ database: SAMPLE_DB_ID }),
};

function createNativeSource(templateTags?: TemplateTags): QueryTransformSource {
  return {
    type: "query",
    query: createMockNativeDatasetQuery({
      database: SAMPLE_DB_ID,
      native: createMockNativeQuery({
        query: "SELECT * FROM table",
        "template-tags": templateTags,
      }),
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
      isMissingIncrementalTableTag(transform, createNativeSource(), metadata),
    ).toBe(false);
  });

  it("returns false for an mbql incremental transform", () => {
    const transform = createMockTransform({
      source_type: "mbql",
      target: createMockTransformTarget({ type: "table-incremental" }),
    });

    expect(isMissingIncrementalTableTag(transform, mbqlSource, metadata)).toBe(
      false,
    );
  });

  it("returns true when the edited native source has a non-table variable", () => {
    const source = createNativeSource({
      snippet1: createMockTemplateTag({
        id: "1",
        name: "snippet1",
        type: "snippet",
      }),
    });

    const transform = createMockTransform({
      source_type: "native",
      target: createMockTransformTarget({ type: "table-incremental" }),
    });

    expect(isMissingIncrementalTableTag(transform, source, metadata)).toBe(
      true,
    );
  });

  it("returns true when the edited native source has no variables", () => {
    const source = createNativeSource();

    const transform = createMockTransform({
      source_type: "native",
      target: createMockTransformTarget({ type: "table-incremental" }),
    });

    expect(isMissingIncrementalTableTag(transform, source, metadata)).toBe(
      true,
    );
  });

  it("returns false when the edited native source still has a table variable", () => {
    const source = createNativeSource({
      my_table: createMockTemplateTag({
        id: "1",
        name: "my_table",
        type: "table",
        "table-id": 42,
      }),
    });

    const transform = createMockTransform({
      source_type: "native",
      target: createMockTransformTarget({ type: "table-incremental" }),
    });

    expect(isMissingIncrementalTableTag(transform, source, metadata)).toBe(
      false,
    );
  });
});
