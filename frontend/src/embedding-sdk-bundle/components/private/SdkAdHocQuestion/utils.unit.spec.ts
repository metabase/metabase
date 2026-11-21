import { createMockMetadata } from "__support__/metadata";
import { deserializeCard, parseHash } from "metabase/common/utils/card";
import * as Urls from "metabase/urls";
import { utf8_to_b64 } from "metabase/utils/encoding";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";
import { createMockUnsavedCard } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { getQuestionParameters } from "./SdkAdHocQuestion";
import { resolveQuestionId } from "./utils";

const METADATA = createMockMetadata({ databases: [createSampleDatabase()] });

const createQuestion = (datasetQuery: DatasetQuery) =>
  new Question(
    createMockUnsavedCard({ dataset_query: datasetQuery }),
    METADATA,
  );

const NATIVE_QUERY = Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
  query: "SELECT 1",
});

const NATIVE_QUESTION = createQuestion(NATIVE_QUERY);

const STRUCTURED_QUESTION = createQuestion(
  Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
);

/**
 * The `/question#<hash>` link the backend builds for a Metabot query: the card
 * as JSON, in the standard base64 alphabet. `datasetQuery` is the query as the
 * backend sends it, which a test may leave malformed.
 */
const createBackendQuestionPath = (datasetQuery: unknown) =>
  `/question#${utf8_to_b64(
    JSON.stringify({
      dataset_query: datasetQuery,
      type: "question",
      visualization_settings: {},
    }),
  )}`;

/** The slug and question `SdkAdHocQuestion` reads from a question path. */
const readQuestionPath = (questionPath: string) => {
  const { location, params } = getQuestionParameters(questionPath);
  const { serializedCard } = parseHash(location.hash);

  return {
    slug: params.slug,
    question: new Question(
      deserializeCard(checkNotNull(serializedCard)),
      METADATA,
    ),
  };
};

describe("resolveQuestionId", () => {
  it("returns 'new-native' for a native card hash with no slug", () => {
    expect(resolveQuestionId(undefined, NATIVE_QUESTION)).toBe("new-native");
  });

  it("returns 'new-native' for an MBQL 5 native query in a link built by the backend", () => {
    const { slug, question } = readQuestionPath(
      createBackendQuestionPath(NATIVE_QUERY),
    );

    expect(resolveQuestionId(slug, question)).toBe("new-native");
  });

  it("returns 'new-native' for an MBQL 5 native query in a generated card link", () => {
    const { slug, question } = readQuestionPath(
      Urls.generatedCard({ type: "card", query: { query: NATIVE_QUERY } }),
    );

    expect(resolveQuestionId(slug, question)).toBe("new-native");
  });

  it("returns null for a link whose query lost its lib/type keys", () => {
    // The backend sends such a query only when it cannot make it valid. It
    // cannot be read as a query, which is for the question loader to report.
    const { slug, question } = readQuestionPath(
      createBackendQuestionPath({
        database: 1,
        stages: [{ native: "SELECT 1" }],
      }),
    );

    expect(resolveQuestionId(slug, question)).toBeNull();
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
