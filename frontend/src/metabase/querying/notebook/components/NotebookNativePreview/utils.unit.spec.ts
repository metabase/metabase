import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { createMockDatabase } from "metabase-types/api/mocks";

import { createNativeQuestion } from "./utils";

const MONGO_DB_ID = 2;
const NATIVE_QUERY = '[{"$project":{"_id":"$_id","title":"$title"}}]';

const METADATA = createMockMetadata({
  databases: [
    createMockDatabase({
      id: MONGO_DB_ID,
      engine: "mongo",
      features: ["native-requires-specified-collection"],
    }),
  ],
});

function setup() {
  const question = Question.create({
    DEPRECATED_RAW_MBQL_databaseId: MONGO_DB_ID,
    metadata: METADATA,
  });
  const metadataProvider = Lib.metadataProvider(MONGO_DB_ID, METADATA);
  const nativeQuestion = checkNotNull(
    createNativeQuestion(
      question,
      { query: NATIVE_QUERY, params: null },
      metadataProvider,
    ),
  );
  return nativeQuestion.query();
}

describe("createNativeQuestion", () => {
  it("should not set a collection when the backend returns none", () => {
    const query = setup();

    expect(Lib.rawNativeQuery(query)).toBe(NATIVE_QUERY);
    expect(Lib.nativeExtras(query)?.collection).toBeUndefined();
  });
});
