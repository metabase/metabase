import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardDataset,
  setupCardEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type { GeneratedCard } from "metabase/api/ai-streaming/schemas";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { parseChartClipboard } from "metabase/common/utils/chart-clipboard";
import { markChartSaved } from "metabase/metabot/state";
import { Route } from "metabase/router";
import { createMockCard, createMockCollection } from "metabase-types/api/mocks";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { MetabotInlineChart } from "./MetabotInlineChart";

// Visualization pulls in the whole charting stack; stub it to a sentinel so we
// can unit test MetabotInlineChart's run / render-states logic.
jest.mock("metabase/visualizations/components/Visualization", () => ({
  __esModule: true,
  default: () => <div data-testid="visualization" />,
}));

const datasetQuery = createMockStructuredDatasetQuery();

const PERSONAL_COLLECTION = createMockCollection({
  id: 1,
  name: "My personal collection",
  can_write: true,
  personal_owner_id: 1,
});

const ROOT_TEST_COLLECTION = createMockCollection({
  ...ROOT_COLLECTION,
  id: "root",
  can_write: false,
});

const value: GeneratedCard = {
  type: "card",
  id: "card-1",
  title: "Orders by month",
  description: "Monthly count of orders.",
  query: { id: "q-1", query: datasetQuery },
  display: "bar",
};

function setupSaveModalEndpoints() {
  setupCollectionByIdEndpoint({ collections: [PERSONAL_COLLECTION] });
  setupCollectionsEndpoints({
    collections: [PERSONAL_COLLECTION],
    rootCollection: ROOT_TEST_COLLECTION,
  });
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupRecentViewsAndSelectionsEndpoints(
    [],
    ["selections", "views"],
    {},
    false,
  );
  setupDatabasesEndpoints([]);
}

function setup(
  args: Parameters<typeof setupCardDataset>[0] = {},
  valueOverrides: Partial<GeneratedCard> = {},
  { readonly = false }: { readonly?: boolean } = {},
) {
  setupCardDataset(args);
  return renderWithProviders(
    <MetabotInlineChart
      value={{ ...value, ...valueOverrides }}
      readonly={readonly}
      conversationId="convo-1"
    />,
  );
}

async function openSaveModal() {
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  return screen.findByTestId("save-question-modal");
}

async function submitSaveModal(modal: HTMLElement) {
  const saveButton = within(modal).getByRole("button", { name: "Save" });
  await waitFor(() => expect(saveButton).toBeEnabled());
  await userEvent.click(saveButton);
}

describe("MetabotInlineChart", () => {
  beforeEach(() => {
    fetchMock.clearHistory();
  });

  it("runs the embedded query and renders the visualization", async () => {
    setup();
    expect(screen.getByTestId("metabot-inline-chart")).toBeInTheDocument();
    expect(await screen.findByTestId("visualization")).toBeInTheDocument();
    expect(fetchMock.callHistory.called("path:/api/dataset")).toBe(true);
  });

  it("shows the title as a link", () => {
    setup();
    expect(screen.getByText("Orders by month")).toHaveAttribute(
      "target",
      "_blank",
    );
  });

  it("does not render the visualization while results are loading", () => {
    setup();
    expect(screen.queryByTestId("visualization")).not.toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    setup({ status: 500 });
    expect(screen.queryByTestId("visualization")).not.toBeInTheDocument();
    expect(
      await screen.findByText("There was a problem displaying this chart."),
    ).toBeInTheDocument();
  });

  it("shows an error message when the dataset comes back with an error", async () => {
    setup({ dataset: { error: "Something went wrong" } });
    expect(screen.queryByTestId("visualization")).not.toBeInTheDocument();
    expect(
      await screen.findByText("There was a problem displaying this chart."),
    ).toBeInTheDocument();
  });

  it("surfaces a permission error with the permission message", async () => {
    setup({
      dataset: {
        error: "no access",
        error_type: "missing-required-permissions",
      },
    });
    expect(
      await screen.findByText(
        "Sorry, you don't have permission to see this card.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the curated error text when present", async () => {
    setup({
      dataset: {
        error: "Column FOO does not exist",
        error_is_curated: true,
      },
    });
    expect(
      await screen.findByText("Column FOO does not exist"),
    ).toBeInTheDocument();
  });

  describe("saving", () => {
    it("opens the save modal when Save is clicked", async () => {
      setupSaveModalEndpoints();
      setup();

      expect(
        screen.queryByTestId("save-question-modal"),
      ).not.toBeInTheDocument();

      const modal = await openSaveModal();
      expect(within(modal).getByLabelText("Name")).toHaveValue(
        "Orders by month",
      );
      expect(within(modal).getByLabelText("Description")).toHaveValue(
        "Monthly count of orders.",
      );
    });

    it("does not render the Save button in readonly mode", () => {
      setup({}, {}, { readonly: true });
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
    });

    it("saves the chart's card through the metabot endpoint", async () => {
      setupSaveModalEndpoints();
      fetchMock.post(
        "express:/api/metabot/conversations/:id/saved-entity",
        createMockCard({ id: 99, metabot_chart_id: "card-1" }),
        {
          name: "save-entity",
          matchPartialBody: true,
          body: {
            chart_id: "card-1",
            card: {
              display: "bar",
              name: "Orders by month",
              description: "Monthly count of orders.",
              dataset_query: datasetQuery,
            },
          },
        },
      );
      setupCardEndpoints(
        createMockCard({ id: 99, metabot_chart_id: "card-1" }),
      );
      setup();

      const modal = await openSaveModal();
      await submitSaveModal(modal);

      await waitFor(() => {
        expect(fetchMock.callHistory.called("save-entity")).toBe(true);
      });
    });

    it("replaces the Save button with a Saved link after saving", async () => {
      setupSaveModalEndpoints();
      fetchMock.post(
        "express:/api/metabot/conversations/:id/saved-entity",
        createMockCard({ id: 99, metabot_chart_id: "card-1" }),
      );
      setupCardEndpoints(
        createMockCard({ id: 99, metabot_chart_id: "card-1" }),
      );
      setup();

      const modal = await openSaveModal();
      await submitSaveModal(modal);

      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: "Save" }),
        ).not.toBeInTheDocument();
      });
      expect(await screen.findByText("Saved")).toBeInTheDocument();
    });

    it("points the title at the saved question instead of the ad-hoc URL after saving", async () => {
      setupCardDataset();
      setupCardEndpoints(
        createMockCard({ id: 99, metabot_chart_id: "card-1" }),
      );
      const { store } = renderWithProviders(
        <Route
          path="/"
          component={() => (
            <MetabotInlineChart
              value={value}
              readonly={false}
              conversationId="convo-1"
            />
          )}
        />,
        { withRouter: true },
      );

      expect(await screen.findByText("Orders by month")).toHaveAttribute(
        "href",
        expect.stringContaining("/question#"),
      );

      act(() => {
        store.dispatch(markChartSaved({ entityId: "card-1", cardId: 99 }));
      });

      await waitFor(() => {
        expect(screen.getByText("Orders by month")).toHaveAttribute(
          "href",
          expect.stringContaining("/question/99"),
        );
      });
    });

    it("flips back to unsaved when the saved card's origin link is severed", async () => {
      setupCardEndpoints(createMockCard({ id: 99, metabot_chart_id: null }));
      const { store } = setup();

      act(() => {
        store.dispatch(markChartSaved({ entityId: "card-1", cardId: 99 }));
      });

      expect(
        await screen.findByRole("button", { name: "Save" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    });

    it("flips back to unsaved when the saved card is gone (404)", async () => {
      fetchMock.get("path:/api/card/99", { status: 404 });
      const { store } = setup();

      act(() => {
        store.dispatch(markChartSaved({ entityId: "card-1", cardId: 99 }));
      });

      expect(
        await screen.findByRole("button", { name: "Save" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    });

    it("stays saved when the card fetch fails transiently", async () => {
      fetchMock.get(
        "path:/api/card/99",
        { status: 500 },
        { name: "card-error" },
      );
      const { store } = setup();

      act(() => {
        store.dispatch(markChartSaved({ entityId: "card-1", cardId: 99 }));
      });

      await waitFor(() => {
        expect(fetchMock.callHistory.called("card-error")).toBe(true);
      });

      expect(await screen.findByText("Saved")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
    });

    it("shows a short 'Saved' link once the chart is marked saved", async () => {
      setupCardEndpoints(
        createMockCard({ id: 99, metabot_chart_id: "card-1" }),
      );
      const { store } = setup();

      act(() => {
        store.dispatch(markChartSaved({ entityId: "card-1", cardId: 99 }));
      });

      expect(await screen.findByText("Saved")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("copying", () => {
    it("copies the chart payload to the clipboard", async () => {
      const writeText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
      setup();

      await userEvent.click(screen.getByRole("button", { name: "Copy chart" }));

      expect(writeText).toHaveBeenCalledTimes(1);
      const payload = parseChartClipboard(writeText.mock.calls[0][0]);
      expect(payload?.display).toBe("bar");
      expect(payload?.name).toBe("Orders by month");
      expect(payload?.description).toBe("Monthly count of orders.");
      expect(payload?.dataset_query).toEqual(datasetQuery);
    });
  });
});
