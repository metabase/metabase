import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupDatabaseEndpoints,
  setupForbiddenCardEndpoints,
} from "__support__/server-mocks";
import { PERMISSION_ERROR } from "__support__/server-mocks/constants";
import { renderWithProviders, screen } from "__support__/ui";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { MetricPageCard } from "./MetricPageCard";

const SAMPLE_DB = createSampleDatabase();
const CARD_ID = 42;

function makeMetricCard(): Card {
  return createMockCard({
    id: CARD_ID,
    type: "metric",
    name: "Count of Orders",
    database_id: SAMPLE_DB_ID,
    table_id: ORDERS_ID,
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: { "source-table": ORDERS_ID, aggregation: [["count"]] },
    },
  });
}

function setupReadableCard(card: Card) {
  setupDatabaseEndpoints(SAMPLE_DB);
  setupCardEndpoints(card);
  setupCardQueryMetadataEndpoint(
    card,
    createMockCardQueryMetadata({ databases: [SAMPLE_DB] }),
  );
}

function setup() {
  renderWithProviders(
    <MetricPageCard cardId={String(CARD_ID)}>
      {(card) => <div data-testid="content">{card.name}</div>}
    </MetricPageCard>,
  );
}

describe("MetricPageCard", () => {
  it("renders the unauthorized state when the card itself is not readable", async () => {
    setupForbiddenCardEndpoints(CARD_ID);

    setup();

    expect(
      await screen.findByText(/permission to see that/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
  });

  it("renders the unauthorized state when the metric query is forbidden", async () => {
    setupReadableCard(makeMetricCard());
    fetchMock.post(`path:/api/card/${CARD_ID}/query`, {
      status: 403,
      body: PERMISSION_ERROR,
    });

    setup();

    expect(
      await screen.findByText(/permission to see that/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
  });

  it("renders children when the metric query succeeds (viewable without ad-hoc data access)", async () => {
    const card = makeMetricCard();
    setupReadableCard(card);
    setupCardQueryEndpoints(
      card,
      createMockDataset({
        data: createMockDatasetData({
          cols: [createMockNumericColumn({ name: "count" })],
          rows: [[18760]],
        }),
      }),
    );

    setup();

    expect(await screen.findByTestId("content")).toHaveTextContent(
      "Count of Orders",
    );
    expect(
      screen.queryByText(/permission to see that/i),
    ).not.toBeInTheDocument();
  });
});
