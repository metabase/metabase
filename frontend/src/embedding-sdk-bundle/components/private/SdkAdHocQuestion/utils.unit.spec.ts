import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";
import { createMockUnsavedCard } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { resolveQuestionId } from "./utils";

const METADATA = createMockMetadata({ databases: [createSampleDatabase()] });

const createQuestion = (datasetQuery: DatasetQuery) =>
  new Question(
    createMockUnsavedCard({ dataset_query: datasetQuery }),
    METADATA,
  );

const NATIVE_QUESTION = createQuestion(
  Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, { query: "SELECT 1" }),
);

const STRUCTURED_QUESTION = createQuestion(
  Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
);

describe("resolveQuestionId", () => {
  it("returns 'new-native' for a native card hash with no slug", () => {
    expect(resolveQuestionId(undefined, NATIVE_QUESTION)).toBe("new-native");
  });

  it("returns null for a structured (MBQL) card hash with no slug", () => {
    expect(resolveQuestionId(undefined, STRUCTURED_QUESTION)).toBeNull();
  });

  it("returns null for a structured stage on top of a native stage", () => {
    const query = Lib.appendStage(
      Lib.createTestNativeQuery(SAMPLE_PROVIDER, { query: "SELECT 1" }),
    );

    expect(
      resolveQuestionId(undefined, createQuestion(Lib.toJsQuery(query))),
    ).toBeNull();
  });

  it("returns numeric ID for a saved question slug", () => {
    expect(
      resolveQuestionId("109-days-when-orders-were-added", undefined),
    ).toBe(109);
  });

  it("returns null when there is no slug and no deserialized card", () => {
    expect(resolveQuestionId(undefined, undefined)).toBeNull();
  });

  it("numeric slug takes precedence over a native card", () => {
    expect(resolveQuestionId("42-my-question", NATIVE_QUESTION)).toBe(42);
  });
});
