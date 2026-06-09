import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
  setupDatabaseEndpoints,
  setupForbiddenCardEndpoints,
  setupMetricEndpoint,
} from "__support__/server-mocks";
import { PERMISSION_ERROR } from "__support__/server-mocks/constants";
import { renderWithProviders, screen } from "__support__/ui";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockMetric,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { MetricAboutPage } from "./MetricAboutPage";

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
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
    },
    ...opts,
  });
}

function setupBaseEndpoints(card: Card) {
  setupDatabaseEndpoints(SAMPLE_DB);
  setupCardEndpoints(card);
  setupCardQueryMetadataEndpoint(
    card,
    createMockCardQueryMetadata({ databases: [SAMPLE_DB] }),
  );
  setupMetricEndpoint(createMockMetric({ id: card.id, name: card.name }));
}

function renderPage() {
  renderWithProviders(
    <Route
      path="/metric/:cardId"
      component={(props: any) => <MetricAboutPage params={props.params} />}
    />,
    {
      withRouter: true,
      initialRoute: `/metric/${CARD_ID}`,
    },
  );
}

describe("MetricAboutPage", () => {
  it("renders the unauthorized state (no tabs) when the metric query is forbidden", async () => {
    setupBaseEndpoints(makeMetricCard());
    fetchMock.post(`path:/api/card/${CARD_ID}/query`, {
      status: 403,
      body: PERMISSION_ERROR,
    });

    renderPage();

    expect(
      await screen.findByText(/permission to see that/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "About" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "History" }),
    ).not.toBeInTheDocument();
  });

  it("renders the unauthorized state when the card itself is not readable", async () => {
    setupDatabaseEndpoints(SAMPLE_DB);
    setupForbiddenCardEndpoints(CARD_ID);

    renderPage();

    expect(
      await screen.findByText(/permission to see that/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "About" }),
    ).not.toBeInTheDocument();
  });
});
