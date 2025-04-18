import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen } from "__support__/ui";
import type { CollectionItemModel } from "metabase-types/api";

import { setup } from "./setup";

describe("PinnedQuestionCard", () => {
  it("should render query card once (metabase#25848)", async () => {
    setup();

    expect(await screen.findByTestId("visualization-root")).toBeInTheDocument();

    expect(fetchMock.calls("path:/api/card/1/query")).toHaveLength(1);
  });
});

describe("description", () => {
  it.each<{ model: CollectionItemModel; description: string }>([
    { model: "card", description: "A question" },
    { model: "metric", description: "A metric" },
  ])(
    "should display the default description for the $model (metabase#45270)",
    async ({ model, description }) => {
      setup({ collection_preview: false, model });

      expect(await screen.findByText(description)).toBeInTheDocument();
      expect(
        screen.queryByRole("img", { name: /info/ }),
      ).not.toBeInTheDocument();
    },
  );

  it.each<{ model: CollectionItemModel }>([
    { model: "card" },
    { model: "metric" },
  ])(
    "should display the correct item description when it is set for the $model",
    async ({ model }) => {
      setup({ collection_preview: false, model, description: "Foobar" });

      expect(await screen.findByText("Foobar")).toBeInTheDocument();
      expect(
        screen.queryByRole("img", { name: /info/ }),
      ).not.toBeInTheDocument();
    },
  );

  it("should not display description with the preview enabled and there is no item description", async () => {
    setup();

    expect(await screen.findByTestId("visualization-root")).toBeInTheDocument();
    expect(screen.queryByText("A question")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /info/ })).not.toBeInTheDocument();
  });

  it("should should display the description in a tooltip when there is an item descrrption", async () => {
    setup({ description: "Foobar" });

    expect(await screen.findByTestId("visualization-root")).toBeInTheDocument();
    await userEvent.hover(screen.getByRole("img", { name: /info/ }));
    expect(await screen.findByText("Foobar")).toBeInTheDocument();
  });
});
