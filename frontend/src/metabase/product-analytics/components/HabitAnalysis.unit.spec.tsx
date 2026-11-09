import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupTableQueryMetadataEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { Analysis, Card, DatasetQuery } from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockField,
  createMockStructuredDatasetQuery,
  createMockTable,
} from "metabase-types/api/mocks";

import { HabitAnalysis } from "./HabitAnalysis";

jest.mock("metabase/visualizations/components/Visualization", () => ({
  __esModule: true,
  default: () => <div data-testid="chart" />,
}));

const TABLE_ID = 12;

const ANALYSIS: Analysis = {
  version: 1,
  compiler_version: 1,
  kind: "habit",
  columns: { timestamp: "ts", person: "user_id", session: "session_id" },
  settings: {
    date_range: { type: "relative", value: -90, unit: "day" },
    grain: "person",
    sub_period: "day",
    active: null,
    filters: [],
  },
};

const QUERY: DatasetQuery = {
  ...createMockStructuredDatasetQuery(),
  ...{ analysis: ANALYSIS },
};

const SAVED_CARD = createMockCard({
  id: 7,
  name: "Saved",
  dataset_query: QUERY,
});

interface SetupOpts {
  card?: Card;
}

const setup = ({ card }: SetupOpts = {}) => {
  fetchMock.post("path:/api/product-analytics/compile", QUERY);
  setupTableQueryMetadataEndpoint(
    createMockTable({
      id: TABLE_ID,
      fields: [
        createMockField({
          id: 1,
          name: "ts",
          display_name: "Event time",
          base_type: "type/DateTime",
        }),
        createMockField({
          id: 2,
          name: "user_id",
          display_name: "User",
          base_type: "type/Integer",
        }),
      ],
    }),
  );
  fetchMock.post("path:/api/dataset", createMockDataset());
  fetchMock.post("path:/api/card", createMockCard({ id: 44 }));
  if (card) {
    fetchMock.put(`path:/api/card/${card.id}`, card);
  }
  renderWithProviders(<HabitAnalysis tableId={TABLE_ID} card={card} />, {
    withRouter: true,
  });
};

const lastCompileInput = async (): Promise<unknown> =>
  fetchMock.callHistory
    .lastCall("path:/api/product-analytics/compile")
    ?.request?.json();

describe("HabitAnalysis", () => {
  it("builds a new analysis from the table's suggestions", async () => {
    setup();
    expect(await screen.findByTestId("chart")).toBeInTheDocument();
    expect(await lastCompileInput()).toEqual({
      table_id: TABLE_ID,
      kind: "habit",
      settings: {},
    });
  });

  it("lets a new analysis choose its columns", async () => {
    setup();
    await screen.findByTestId("chart");
    await userEvent.click(screen.getByRole("textbox", { name: "Person" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "Event time" }),
    );
    await waitFor(async () => {
      expect(await lastCompileInput()).toMatchObject({
        columns: { timestamp: "ts", person: "ts" },
      });
    });
  });

  it("doesn't offer to change a saved analysis's columns", async () => {
    setup({ card: SAVED_CARD });
    await screen.findByTestId("chart");
    expect(screen.queryByLabelText("Person")).not.toBeInTheDocument();
  });

  it("asks for a new query when a setting changes", async () => {
    setup();
    await screen.findByTestId("chart");
    await userEvent.click(screen.getByText("Weeks"));
    await waitFor(async () => {
      expect(await lastCompileInput()).toMatchObject({
        settings: { sub_period: "week" },
      });
    });
  });

  it("offers sessions only when the analysis has a session column", async () => {
    setup();
    expect(await screen.findByText("Sessions")).toBeInTheDocument();
  });

  it("saves a new analysis as its query", async () => {
    setup();
    await screen.findByTestId("chart");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.type(await screen.findByLabelText("Name"), "Stickiness");
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Save",
      }),
    );
    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/card")).toBe(true);
    });
    const body: unknown = await fetchMock.callHistory
      .lastCall("path:/api/card")
      ?.request?.json();
    expect(body).toMatchObject({
      name: "Stickiness",
      dataset_query: { analysis: { kind: "habit" } },
    });
  });

  it("shows what was saved until a setting changes", async () => {
    setup({ card: SAVED_CARD });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    await screen.findByTestId("chart");
    expect(
      fetchMock.callHistory.called("path:/api/product-analytics/compile"),
    ).toBe(false);
  });

  it("keeps a saved analysis's columns when a setting changes", async () => {
    setup({ card: SAVED_CARD });
    await screen.findByTestId("chart");
    await userEvent.click(screen.getByText("Weeks"));
    await waitFor(async () => {
      expect(await lastCompileInput()).toMatchObject({
        columns: ANALYSIS.columns,
        settings: { sub_period: "week" },
      });
    });
  });

  it("saves over a saved analysis with its query", async () => {
    setup({ card: SAVED_CARD });
    await screen.findByTestId("chart");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/card/7")).toBe(true);
    });
    const body: unknown = await fetchMock.callHistory
      .lastCall("path:/api/card/7")
      ?.request?.json();
    expect(body).toMatchObject({
      dataset_query: { analysis: { kind: "habit" } },
    });
  });
});
