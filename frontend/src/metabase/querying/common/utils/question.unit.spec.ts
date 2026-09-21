import { createMockMetadata } from "__support__/metadata";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { isQuestionDirty } from "./question";

const metadata = createMockMetadata({ databases: [createSampleDatabase()] });

function getModelQuestion(sourceTableId = ORDERS_ID) {
  return new Question(
    createMockCard({
      id: 1,
      type: "model",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": sourceTableId },
      },
    }),
    metadata,
  );
}

describe("isQuestionDirty", () => {
  it("is not dirty when there is no question", () => {
    expect(isQuestionDirty(undefined, undefined)).toBe(false);
  });

  it("is dirty for a new model that has no original question", () => {
    expect(isQuestionDirty(getModelQuestion(), undefined)).toBe(true);
  });

  it("is dirty when the model differs from its original", () => {
    expect(
      isQuestionDirty(
        getModelQuestion(PRODUCTS_ID),
        getModelQuestion(ORDERS_ID),
      ),
    ).toBe(true);
  });

  it("is not dirty when the model matches its original", () => {
    expect(
      isQuestionDirty(getModelQuestion(ORDERS_ID), getModelQuestion(ORDERS_ID)),
    ).toBe(false);
  });
});
