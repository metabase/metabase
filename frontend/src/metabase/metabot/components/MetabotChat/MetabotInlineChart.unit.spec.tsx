import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCardDataset } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { GeneratedCard } from "metabase/api/ai-streaming/schemas";
import { parseChartClipboard } from "metabase/common/utils/chart-clipboard";
import type Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { MetabotInlineChart } from "./MetabotInlineChart";

// Visualization pulls in the whole charting stack; stub it to a sentinel so we
// can unit test MetabotInlineChart's run / render-states logic.
jest.mock("metabase/visualizations/components/Visualization", () => ({
  __esModule: true,
  default: () => <div data-testid="visualization" />,
}));

// The real SaveQuestionModal (with its collection/dashboard picker) is covered by
// its own spec; here we stub it to assert the open + create wiring only.
jest.mock("metabase/common/components/SaveQuestionModal", () => ({
  __esModule: true,
  SaveQuestionModal: ({
    question,
    onCreate,
    onClose,
  }: {
    question: Question;
    onCreate: (question: Question) => Promise<Question>;
    onClose: () => void;
  }) => (
    <div data-testid="save-question-modal">
      <button onClick={() => onCreate(question)}>mock-confirm-save</button>
      <button onClick={onClose}>mock-close</button>
    </div>
  ),
}));

const datasetQuery = createMockStructuredDatasetQuery();

const value: GeneratedCard = {
  type: "card",
  id: "card-1",
  title: "Orders by month",
  description: "Monthly count of orders.",
  query: { id: "q-1", query: datasetQuery },
  display: "bar",
};

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
    />,
  );
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
      setup();
      expect(
        screen.queryByTestId("save-question-modal"),
      ).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(screen.getByTestId("save-question-modal")).toBeInTheDocument();
    });

    it("does not render the Save button in readonly mode", () => {
      setup({}, {}, { readonly: true });
      expect(
        screen.queryByRole("button", { name: "Save" }),
      ).not.toBeInTheDocument();
    });

    it("creates a card with the chart's query and display on save", async () => {
      // The route only matches when the POST body carries the chart's fields, so
      // asserting it was called verifies the request payload.
      fetchMock.post("path:/api/card", createMockCard({ id: 99 }), {
        name: "create-card",
        matchPartialBody: true,
        body: {
          display: "bar",
          name: "Orders by month",
          description: "Monthly count of orders.",
          dataset_query: datasetQuery,
        },
      });
      setup();

      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      await userEvent.click(
        screen.getByRole("button", { name: "mock-confirm-save" }),
      );

      await waitFor(() => {
        expect(fetchMock.callHistory.called("create-card")).toBe(true);
      });
    });

    it("replaces the Save button with a Saved link after saving", async () => {
      fetchMock.post("path:/api/card", createMockCard({ id: 99 }));
      const { store } = setup();

      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      await userEvent.click(
        screen.getByRole("button", { name: "mock-confirm-save" }),
      );

      await waitFor(() => {
        expect(store.getState().metabot.savedChartCardIds["card-1"]).toBe(99);
      });
      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: "Save" }),
        ).not.toBeInTheDocument();
      });
      expect(await screen.findByText("Saved")).toBeInTheDocument();
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
