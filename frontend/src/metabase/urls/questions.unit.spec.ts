import { assoc, dissoc } from "icepick";

import { createMockMetadata } from "__support__/metadata";
import Question from "metabase-lib/v1/Question";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { newQuestion, question } from "./questions";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const orders_raw_card = {
  id: 1,
  name: "Raw orders data",
  display: "table",
  visualization_settings: {},
  can_write: true,
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
    },
  },
};

describe("urls > questions", () => {
  describe("question", () => {
    const adhocUrl =
      "/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImRhdGFiYXNlIjoxLCJsaWIvdHlwZSI6Im1icWwvcXVlcnkiLCJzdGFnZXMiOlt7ImxpYi90eXBlIjoibWJxbC5zdGFnZS9tYnFsIiwic291cmNlLXRhYmxlIjoyfV19LCJkaXNwbGF5IjoidGFibGUiLCJuYW1lIjoiUmF3IG9yZGVycyBkYXRhIiwicGFyYW1ldGVyVmFsdWVzIjp7fSwidmlzdWFsaXphdGlvbl9zZXR0aW5ncyI6e319";

    // Covered a lot in query_builder/actions.spec.js, just very basic cases here
    // (currently getUrl has logic that is strongly tied to the logic query builder Redux actions)
    describe("question(originalQuestion?)", () => {
      it("returns URL with ID for saved question", () => {
        const q = new Question(assoc(orders_raw_card, "id", 1), metadata);
        expect(question(q)).toBe("/question/1-raw-orders-data");
      });

      it("returns a URL with hash for an unsaved question", () => {
        const q = new Question(dissoc(orders_raw_card, "id"), metadata);
        expect(question(q)).toBe(adhocUrl);
      });
    });

    it("should avoid generating URLs with transient IDs", () => {
      const q = new Question(
        { ...orders_raw_card, id: "foo", original_card_id: "bar" },
        metadata,
      );

      expect(question(q)).toBe(adhocUrl);
    });
  });

  describe("newQuestion", () => {
    it("should return the correct url", () => {
      const hash =
        "eyJkYXRhc2V0X3F1ZXJ5Ijp7ImRhdGFiYXNlIjpudWxsLCJsaWIvdHlwZSI6Im1icWwvcXVlcnkiLCJzdGFnZXMiOlt7ImxpYi90eXBlIjoibWJxbC5zdGFnZS9tYnFsIiwic291cmNlLXRhYmxlIjpudWxsfV19LCJkaXNwbGF5IjoidGFibGUiLCJwYXJhbWV0ZXJWYWx1ZXMiOnt9LCJ2aXN1YWxpemF0aW9uX3NldHRpbmdzIjp7fX0=";

      expect(newQuestion({ mode: "query" })).toBe(`/question/query#${hash}`);
      expect(newQuestion({ mode: "notebook" })).toBe(
        `/question/notebook#${hash}`,
      );
      expect(newQuestion({ mode: "view" })).toBe(`/question/view#${hash}`);
      expect(newQuestion({ mode: "ask" })).toBe("/question/ask");
    });
  });
});
