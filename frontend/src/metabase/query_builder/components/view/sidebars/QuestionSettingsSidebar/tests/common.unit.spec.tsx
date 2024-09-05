import fetchMock from "fetch-mock";

import { screen } from "__support__/ui";
import {
  createMockCard,
  getMockModelCacheInfo,
} from "metabase-types/api/mocks";

import { setup } from "./setup";

describe("QuestionSettingsSidebar", () => {
  it("should render the question settings sidesheet", () => {
    setup({});
    expect(screen.getByText("Question settings")).toBeInTheDocument();
  });

  it("should show a model title for models", () => {
    setup({ card: createMockCard({ type: "model" }) });
    expect(screen.getByText("Model settings")).toBeInTheDocument();
  });

  it("should show a metrics title for metrics", () => {
    setup({ card: createMockCard({ type: "metric" }) });
    expect(screen.getByText("Metric settings")).toBeInTheDocument();
  });

  describe("caching", () => {
    it("should not allow to configure caching without cache token feature", async () => {
      const card = createMockCard({
        cache_ttl: 10,
        description: "abc",
      });

      await setup({ card });
      expect(screen.queryByText("Caching policy")).not.toBeInTheDocument();
    });

    it("should show model caching controls", async () => {
      const model = createMockCard({
        type: "model",
        cache_ttl: 10,
        description: "abc",
        persisted: true,
      });
      const modelCacheInfo = getMockModelCacheInfo({
        card_id: model.id,
        card_name: model.name,
      });

      fetchMock.get(`path:/api/persist/card/${model.id}`, modelCacheInfo);
      await setup({ card: model });

      expect(await screen.findByText(/Model last cached/)).toBeInTheDocument();
    });
  });
});
