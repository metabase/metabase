import { createMockMetadata } from "__support__/metadata";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockNativeDatasetQuery,
  createMockParameter,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import {
  createAdHocNativeCard,
  createSampleDatabase,
  createSavedStructuredCard,
  createSavedNativeCard,
} from "metabase-types/api/mocks/presets";

import { canExploreResults } from "./utils";

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
      dataset_query: createMockNativeDatasetQuery({
        type: "native",
        native: {
          query: "select * from order where id > {{min_id}}",
          "template-tags": {
            min_id: createMockTemplateTag({
              type: "text",
              name: "min_id",
              "display-name": "Min ID",
            }),
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
