import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockParameter,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { canExploreResults } from "./utils";

function createSavedStructuredCard() {
  return createMockCard({
    dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
  });
}

function createAdHocNativeCard() {
  return createMockUnsavedCard({
    dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
      query: "select * from orders",
    }),
  });
}

function createSavedNativeCard() {
  return createMockCard({
    query_type: "native",
    dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
      query: "select * from orders",
    }),
  });
}

describe("canExploreResults", () => {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });

  it("should be false if not native", () => {
    const q = new Question(createSavedStructuredCard(), metadata);
    expect(canExploreResults(q)).toBe(false);
  });

  it("should be false when not saved", () => {
    const q = new Question(createAdHocNativeCard(), metadata);
    expect(canExploreResults(q)).toBe(false);
  });

  it("should be false with parameters", () => {
    const card = createMockCard({
      query_type: "native",
      dataset_query: Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
        query: "select * from order where id > {{min_id}}",
        templateTags: {
          min_id: {
            type: "text",
            name: "min_id",
            "display-name": "Min ID",
          },
        },
      }),
      parameters: [
        createMockParameter({
          name: "Min ID",
          slug: "min_id",
          type: "category",
        }),
      ],
    });
    const q = new Question(card, metadata);
    expect(canExploreResults(q)).toBe(false);
  });

  it("should be false when not canNest", () => {
    const metadata = createMockMetadata({
      databases: [createSampleDatabase({ features: [] })],
    });
    const q = new Question(createSavedNativeCard(), metadata);
    expect(canExploreResults(q)).toBe(false);
  });

  it("should be false when is readOnly", () => {
    const metadata = createMockMetadata({
      databases: [createSampleDatabase({ native_permissions: "none" })],
    });
    const q = new Question(createSavedNativeCard(), metadata);
    expect(canExploreResults(q)).toBe(false);
  });

  it("should be true", () => {
    const q = new Question(createSavedNativeCard(), metadata);
    expect(canExploreResults(q)).toBe(true);
  });
});
