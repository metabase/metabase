import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
  setupDatabaseEndpoints,
} from "__support__/server-mocks";
import { PERMISSION_ERROR } from "__support__/server-mocks/constants";
import { renderWithProviders, screen } from "__support__/ui";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { MetricPageCard } from "./MetricPageCard";

const SAMPLE_DB = createSampleDatabase();
const CARD_ID = 42;

function makeMetricCard(opts: Partial<Card> = {}): Card {
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
    ...opts,
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
    fetchMock.get(`path:/api/card/${CARD_ID}`, {
      status: 403,
      body: PERMISSION_ERROR,
    });
    fetchMock.get(`path:/api/card/${CARD_ID}/query_metadata`, {
      status: 403,
      body: PERMISSION_ERROR,
    });

    setup();

    expect(
      await screen.findByText(/permission to see that/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
  });

  it("renders the unauthorized state when the user can't run the card's query", async () => {
    setupReadableCard(makeMetricCard({ can_run_adhoc_query: false }));

    setup();

    expect(
      await screen.findByText(/permission to see that/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
  });

  it("renders children with the card when it is readable and runnable", async () => {
    setupReadableCard(makeMetricCard({ can_run_adhoc_query: true }));

    setup();

    expect(await screen.findByTestId("content")).toHaveTextContent(
      "Count of Orders",
    );
    expect(
      screen.queryByText(/permission to see that/i),
    ).not.toBeInTheDocument();
  });
});
