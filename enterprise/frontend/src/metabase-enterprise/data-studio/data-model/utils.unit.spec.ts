import { createMockCard, createMockCollection } from "metabase-types/api/mocks";

import { getPublishSeeItLink } from "./components/TablePicker/utils";

const createMockPublishModelsResponse = ({
  target_collection = createMockCollection({ type: "library-models" }),
  models = [createMockCard({ type: "model" })],
  created_count = 1,
} = {}) => {
  return { target_collection, models, created_count };
};

describe("getPublishSeeItLink", () => {
  describe("published inside data studio", () => {
    it("1 model created", () => {
      const response = createMockPublishModelsResponse();
      const link = getPublishSeeItLink(response);

      expect(link).toContain(
        `data-studio/modeling/models/${response.models[0].id}`,
      );
    });

    it("> 1 model created", () => {
      const response = createMockPublishModelsResponse({ created_count: 2 });
      const link = getPublishSeeItLink(response);

      expect(link).toContain(
        `data-studio/modeling/collections/${response.target_collection.id}`,
      );
    });
  });

  describe("published outside data studio", () => {
    it("1 model created", () => {
      const response = createMockPublishModelsResponse({
        target_collection: createMockCollection(),
      });
      const link = getPublishSeeItLink(response);

      expect(link).toContain(`model/${response.models[0].id}`);
    });

    it("> 1 model created", () => {
      const response = createMockPublishModelsResponse({
        target_collection: createMockCollection(),
        created_count: 2,
      });
      const link = getPublishSeeItLink(response);

      expect(link).toContain(`collection/${response.target_collection.id}`);
    });
  });
});
