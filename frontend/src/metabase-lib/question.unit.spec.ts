import {
  createAdHocNativeCard,
  createSampleDatabase,
  createSavedStructuredCard,
  createSavedNativeCard,
} from "metabase-types/api/mocks/presets";
import { createMockMetadata } from "__support__/metadata";
import {
  createMockCard,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import Question from "./Question";

describe("Question.canExploreResults", () => {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });

  it("should be false if not native", () => {
    const q = new Question(createSavedStructuredCard(), metadata);
    expect(q.canExploreResults()).toBe(false);
  });

  it("should be false when not saved", () => {
    const q = new Question(createAdHocNativeCard(), metadata);
    expect(q.canExploreResults()).toBe(false);
  });

  it("should be false with parameters", () => {
    const card = createMockCard({
      dataset_query: createMockNativeDatasetQuery({
        type: "native",
        native: {
          query: "select * from order where id > {{min_id}}",
          "template-tags": {
            min_id: {
              type: "text",
              name: "min_id",
              id: "uuid",
              "display-name": "Min ID",
            },
          },
        },
      }),
      parameters: [
        {
          id: "uuid",
          type: "category",
          // target: ["variable", ["template-tag", "min_id"]],
          name: "Min ID",
          slug: "min_id",
        },
      ],
    });
    const q = new Question(card, metadata);
    expect(q.canExploreResults()).toBe(false);
  });

  it("should be false when not canNest", () => {
    const metadata = createMockMetadata({
      databases: [createSampleDatabase({ features: [] })],
    });
    const q = new Question(createSavedNativeCard(), metadata);
    expect(q.canExploreResults()).toBe(false);
  });

  it("should be false when is readOnly", () => {
    const metadata = createMockMetadata({
      databases: [createSampleDatabase({ native_permissions: "none" })],
    });
    const q = new Question(createSavedNativeCard(), metadata);
    expect(q.canExploreResults()).toBe(false);
  });

  it("should be true", () => {
    const q = new Question(createSavedNativeCard(), metadata);
    expect(q.canExploreResults()).toBe(true);
  });
});
