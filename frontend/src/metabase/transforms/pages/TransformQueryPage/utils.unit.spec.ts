import { createMockMetadata } from "__support__/metadata";
import { getLibQuery } from "metabase/transforms/utils";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import {
  createMockStructuredDatasetQuery,
  createMockTemplateTag,
  createMockTransform,
  createMockTransformTarget,
} from "metabase-types/api/mocks";

import { isRemovingIncrementalTableTag } from "./utils";

jest.mock("metabase/transforms/utils", () => ({
  getLibQuery: jest.fn(),
}));

jest.mock("metabase-lib", () => ({
  ...jest.requireActual<typeof Lib>("metabase-lib"),
  templateTags: jest.fn(),
}));

const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);

const mockGetLibQuery = getLibQuery as jest.MockedFunction<typeof getLibQuery>;
const mockTemplateTags = Lib.templateTags as jest.MockedFunction<
  typeof Lib.templateTags
>;

const metadata = createMockMetadata({});

const nativeSource = {
  type: "query" as const,
  query: createMockStructuredDatasetQuery(),
};

describe("isRemovingIncrementalTableTag", () => {
  it("returns false for a non-incremental transform", () => {
    const transform = createMockTransform({
      source_type: "native",
      target: createMockTransformTarget({ type: "table" }),
    });

    expect(
      isRemovingIncrementalTableTag(transform, nativeSource, metadata),
    ).toBe(false);
  });

  it("returns false for an mbql incremental transform", () => {
    const transform = createMockTransform({
      source_type: "mbql",
      target: createMockTransformTarget({ type: "table-incremental" }),
    });

    expect(
      isRemovingIncrementalTableTag(transform, nativeSource, metadata),
    ).toBe(false);
  });

  it("returns true when the edited native source has no table variable", () => {
    mockGetLibQuery.mockReturnValue(query);
    mockTemplateTags.mockReturnValue({
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

    expect(
      isRemovingIncrementalTableTag(transform, nativeSource, metadata),
    ).toBe(true);
  });

  it("returns true when the edited native source has no lib query", () => {
    mockGetLibQuery.mockReturnValue(null);

    const transform = createMockTransform({
      source_type: "native",
      target: createMockTransformTarget({ type: "table-incremental" }),
    });

    expect(
      isRemovingIncrementalTableTag(transform, nativeSource, metadata),
    ).toBe(true);
  });

  it("returns false when the edited native source still has a table variable", () => {
    mockGetLibQuery.mockReturnValue(query);
    mockTemplateTags.mockReturnValue({
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

    expect(
      isRemovingIncrementalTableTag(transform, nativeSource, metadata),
    ).toBe(false);
  });
});
