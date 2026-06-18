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
import registerVisualizations from "metabase/visualizations/register";
import type { Card, Dataset, Field } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockColumn,
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

registerVisualizations();

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

const SCALAR_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [createMockNumericColumn({ name: "count" })],
    rows: [],
  }),
});

function setup(card: Card, dataset: Dataset = SCALAR_DATASET) {
  setupDatabaseEndpoints(SAMPLE_DB);
  setupCardEndpoints(card);
  setupCardQueryMetadataEndpoint(
    card,
    createMockCardQueryMetadata({ databases: [SAMPLE_DB] }),
  );
  setupCardQueryEndpoints(card, dataset);
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
    expect(await screen.findByText("Source")).toBeInTheDocument();
    expect(screen.queryByTestId("explore-link")).not.toBeInTheDocument();
  });

  // The value preview (latest value + period-over-period change) only renders
  // for a time series, so its presence/absence tells us which branch was chosen.
  describe("value + change-over-time preview", () => {
    const TIME_SERIES = createMockDataset({
      data: createMockDatasetData({
        cols: [
          createMockColumn({
            name: "created_at",
            base_type: "type/DateTime",
            unit: "month",
          }),
          createMockNumericColumn({ name: "count" }),
        ],
        rows: [
          ["2023-12-01T00:00:00Z", 100],
          ["2024-01-01T00:00:00Z", 150],
        ],
      }),
    });

    it("shows the latest value when results are a (date, value) time series", async () => {
      setup(
        makeMetricCard([
          createMockField({ name: "created_at", base_type: "type/DateTime" }),
          createMockField({ name: "count", base_type: "type/Integer" }),
        ]),
        TIME_SERIES,
      );

      expect(
        await screen.findByTestId("metric-value-preview"),
      ).toHaveTextContent("150");
    });

    it("does not show the value preview for a scalar metric with no date column", async () => {
      setup(
        makeMetricCard([
          createMockField({ name: "count", base_type: "type/Integer" }),
        ]),
      );

      expect(await screen.findByText("Source")).toBeInTheDocument();
      expect(
        screen.queryByTestId("metric-value-preview"),
      ).not.toBeInTheDocument();
    });

    it("does not show the value preview when broken out by a non-temporal dimension", async () => {
      setup(
        makeMetricCard([
          createMockField({
            name: "category",
            base_type: "type/Text",
            semantic_type: "type/Category",
          }),
          createMockField({ name: "count", base_type: "type/Integer" }),
        ]),
      );

      expect(await screen.findByText("Source")).toBeInTheDocument();
      expect(
        screen.queryByTestId("metric-value-preview"),
      ).not.toBeInTheDocument();
    });

    it("does not show the value preview for a multi-breakout series where the value is not the second column", async () => {
      setup(
        makeMetricCard([
          createMockField({ name: "created_at", base_type: "type/DateTime" }),
          createMockField({
            name: "category",
            base_type: "type/Text",
            semantic_type: "type/Category",
          }),
          createMockField({ name: "count", base_type: "type/Integer" }),
        ]),
      );

      expect(await screen.findByText("Source")).toBeInTheDocument();
      expect(
        screen.queryByTestId("metric-value-preview"),
      ).not.toBeInTheDocument();
    });
  });
});
