import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { CollectionItemModel } from "metabase-types/api";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { setup } from "./setup";

describe("PinnedQuestionCard", () => {
  it("should render query card once (metabase#25848)", async () => {
    setup();

    expect(await screen.findByTestId("visualization-root")).toBeInTheDocument();

    expect(fetchMock.callHistory.calls("path:/api/card/1/query")).toHaveLength(
      1,
    );
  });

  it("uses the default display for a pinned metric preview", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [
            {
              type: "column",
              name: "TOTAL",
              sourceName: "ORDERS",
              bins: 10,
            },
          ],
        },
      ],
    });

    setup(
      { model: "metric", collection_preview: true },
      {
        card: { type: "metric", display: "line" },
        dataset: { json_query: Lib.toJsQuery(query) },
        databases: [createSampleDatabase()],
      },
    );

    expect(await screen.findByTestId("visualization-root")).toHaveAttribute(
      "data-viz-ui-name",
      "Bar",
    );
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
