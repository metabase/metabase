import { Route } from "react-router";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupDatabaseEndpoints,
  setupMetricEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { Card, Field } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockDataset,
  createMockDatasetData,
  createMockField,
  createMockMetric,
  createMockNumericColumn,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { MetricAbout } from "./MetricAbout";

const SAMPLE_DB = createSampleDatabase();

const mockUrls = {
  about: (id: number) => `/metric/${id}`,
  overview: (id: number) => `/metric/${id}/overview`,
  query: (id: number) => `/metric/${id}/query`,
  dependencies: (id: number) => `/metric/${id}/dependencies`,
  caching: (id: number) => `/metric/${id}/caching`,
  history: (id: number) => `/metric/${id}/history`,
};

function makeMetricCard(resultMetadata: Field[]): Card {
  return createMockCard({
    id: 42,
    type: "metric",
    database_id: SAMPLE_DB_ID,
    table_id: ORDERS_ID,
    result_metadata: resultMetadata,
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
    },
  });
}

function setup(card: Card) {
  setupDatabaseEndpoints(SAMPLE_DB);
  setupCardEndpoints(card);
  setupCardQueryMetadataEndpoint(
    card,
    createMockCardQueryMetadata({ databases: [SAMPLE_DB] }),
  );
  setupCardQueryEndpoints(
    card,
    createMockDataset({
      data: createMockDatasetData({
        cols: [createMockNumericColumn({ name: "count" })],
        rows: [],
      }),
    }),
  );
  setupMetricEndpoint(createMockMetric({ id: card.id, name: card.name }));

  renderWithProviders(
    <Route
      path="/"
      component={() => <MetricAbout card={card} urls={mockUrls} />}
    />,
    {
      storeInitialState: createMockState(),
      withRouter: true,
      initialRoute: "/",
    },
  );
}

describe("MetricAbout", () => {
  it("renders the Explore button on the chart card for numeric metrics", async () => {
    setup(
      makeMetricCard([
        createMockField({ name: "count", base_type: "type/Integer" }),
      ]),
    );

    expect(await screen.findByTestId("explore-link")).toHaveAttribute(
      "href",
      "/explore?metricId=42",
    );
  });

  it("does not render the Explore button when the metric has no summable column", async () => {
    setup(
      makeMetricCard([
        createMockField({ name: "category", base_type: "type/Text" }),
      ]),
    );

    // Wait for the description section to render so the negative assertion
    // isn't trivially true (the page hasn't loaded yet).
    expect(await screen.findByText("Source table")).toBeInTheDocument();
    expect(screen.queryByTestId("explore-link")).not.toBeInTheDocument();
  });
});
