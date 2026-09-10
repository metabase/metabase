import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupDatabaseListEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { VizAbPage } from "./VizAbPage";

registerVisualizations();

const SAMPLE_DB = createSampleDatabase();
const CARD_ID = 7;

function makeCountCard(): Card {
  return createMockCard({
    id: CARD_ID,
    name: "Order count",
    display: "table",
    database_id: SAMPLE_DB_ID,
    table_id: ORDERS_ID,
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
    },
  });
}

function setup() {
  const posted: { body?: Record<string, unknown> } = {};
  const card = makeCountCard();
  setupDatabaseListEndpoint([SAMPLE_DB]);
  setupCardEndpoints(card);
  setupCardQueryMetadataEndpoint(
    card,
    createMockCardQueryMetadata({ databases: [SAMPLE_DB] }),
  );
  setupCardQueryEndpoints(
    card,
    createMockDataset({
      row_count: 1,
      data: createMockDatasetData({
        cols: [
          createMockColumn({
            name: "count",
            display_name: "Count",
            base_type: "type/Integer",
            effective_type: "type/Integer",
            source: "aggregation",
          }),
        ],
        rows: [[1234]],
      }),
    }),
  );
  fetchMock.get("path:/api/viz-eval/random-card", {
    id: CARD_ID,
    remaining: 1,
  });
  fetchMock.get("path:/api/viz-eval/judgements", []);
  fetchMock.post("path:/api/viz-eval/judgements", async (call) => {
    posted.body = await call.request?.json();
    return { ...posted.body, id: 1 };
  });

  renderWithProviders(<VizAbPage />, { withRouter: true });
  return posted;
}

describe("VizAbPage", () => {
  it("renders the three panels and records a judgement", async () => {
    const posted = setup();

    expect(await screen.findByText("1 · Saved")).toBeInTheDocument();
    expect(screen.getByText("2 · Current default")).toBeInTheDocument();
    expect(screen.getByText("3 · New default")).toBeInTheDocument();

    const button = await screen.findByRole("button", { name: /Saved best/ });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    await waitFor(() => expect(posted.body).toBeDefined());
    expect(posted.body).toMatchObject({
      card_id: CARD_ID,
      verdict: "saved",
      saved_display: "table",
      current_display: "scalar",
    });
  }, 30_000);
});
