import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { NativeDatasetResponse } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
  createSavedStructuredCard,
} from "metabase-types/api/mocks/presets";

import { createNativeQuestion } from "./utils";

const SOURCE_CARD_ID = 1;

const sourceCard = createSavedStructuredCard({ id: SOURCE_CARD_ID });

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
  questions: [sourceCard],
});

function createTableQuestion() {
  const card = createMockCard({
    id: 2,
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: { "source-table": ORDERS_ID },
    },
  });
  return new Question(card, metadata);
}

function createNestedQuestion() {
  const card = createMockCard({
    id: 3,
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: { "source-table": `card__${SOURCE_CARD_ID}` },
    },
  });
  return new Question(card, metadata);
}

function createResponse(
  overrides: Partial<NativeDatasetResponse> = {},
): NativeDatasetResponse {
  return {
    query: "SELECT * FROM ORDERS",
    params: null,
    ...overrides,
  };
}

describe("createNativeQuestion", () => {
  it("converts a table-based question to a native question with the source database", () => {
    const result = createNativeQuestion(
      createTableQuestion(),
      createResponse(),
    );

    expect(result).toBeDefined();
    const query = result!.query();
    expect(Lib.queryDisplayInfo(query).isNative).toBe(true);
    expect(Lib.databaseID(query)).toBe(SAMPLE_DB_ID);
    expect(Lib.rawNativeQuery(query)).toBe("SELECT * FROM ORDERS");
  });

  // metabase#40422: converting a question that sources another question (a
  // nested `card__<id>` query) must resolve the database of the underlying
  // card, otherwise the converted native question has no database and cannot
  // be saved.
  it("converts a question sourced from another question to a native question with the underlying database (metabase#40422)", () => {
    const result = createNativeQuestion(
      createNestedQuestion(),
      createResponse(),
    );

    expect(result).toBeDefined();
    const query = result!.query();
    expect(Lib.queryDisplayInfo(query).isNative).toBe(true);
    expect(Lib.databaseID(query)).toBe(SAMPLE_DB_ID);
    expect(Lib.rawNativeQuery(query)).toBe("SELECT * FROM ORDERS");
  });

  it("returns undefined when there is no native dataset response", () => {
    expect(
      createNativeQuestion(createNestedQuestion(), undefined),
    ).toBeUndefined();
  });
});
