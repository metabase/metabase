import { screen } from "__support__/ui";
import { createMockCard } from "metabase-types/api/mocks";

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
    const model = createMockCard({
      type: "model",
      description: "abc",
      persisted: true,
    });

    const card = createMockCard({
      cache_ttl: 10,
      description: "abc",
    });

    it("should not allow to configure caching without cache token feature", async () => {
      await setup({ card });
      expect(screen.queryByText("Caching")).not.toBeInTheDocument();
    });

    it("should not show granular model caching controls on OSS", async () => {
      await setup({ card: model });
      expect(await screen.findByText(/Model last cached/)).toBeInTheDocument();
      expect(screen.queryByText(/Persist model data/)).not.toBeInTheDocument();
    });

    it("should show model cache refresh controls on OSS", async () => {
      await setup({ card: model });
      expect(await screen.findByText(/Model last cached/)).toBeInTheDocument();
    });
  });
});
