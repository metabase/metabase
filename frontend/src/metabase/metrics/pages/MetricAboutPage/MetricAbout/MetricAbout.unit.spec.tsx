import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupDatabaseEndpoints,
  setupMetricDatasetEndpoint,
  setupMetricEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Card, Dataset, Field, Metric } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockField,
  createMockMetric,
  createMockMetricDimension,
  createMockNumericColumn,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
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
  dimensions: (id: number) => `/metric/${id}/dimensions`,
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

const BINNED_NUMERIC_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [
      createMockColumn({
        name: "quantity",
        display_name: "Quantity: 8 bins",
        base_type: "type/Integer",
        effective_type: "type/Integer",
        binning_info: {
          binning_strategy: "num-bins",
          min_value: 0,
          max_value: 100,
          num_bins: 8,
          bin_width: 12.5,
        },
      }),
      createMockNumericColumn({ name: "count" }),
    ],
    rows: [
      [0, 10],
      [12.5, 20],
    ],
  }),
});

interface SetupOptions {
  metric?: Metric;
  metricDataset?: Dataset;
}

function setup(
  card: Card,
  dataset: Dataset = SCALAR_DATASET,
  { metric, metricDataset }: SetupOptions = {},
) {
  setupDatabaseEndpoints(SAMPLE_DB);
  setupCardEndpoints(card);
  setupCardQueryMetadataEndpoint(
    card,
    createMockCardQueryMetadata({ databases: [SAMPLE_DB] }),
  );
  setupCardQueryEndpoints(card, dataset);
  setupMetricEndpoint(
    metric ?? createMockMetric({ id: card.id, name: card.name }),
  );
  if (metricDataset) {
    setupMetricDatasetEndpoint(metricDataset);
  }

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

async function getMetricDatasetRequest(): Promise<unknown> {
  await waitFor(() => {
    expect(fetchMock.callHistory.calls("metric-dataset")).toHaveLength(1);
  });

  return fetchMock.callHistory.lastCall("metric-dataset")?.request?.json();
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

  describe("curated default dimension", () => {
    it("queries the curated default instead of the saved card query", async () => {
      const defaultDimensionId = "product-category";
      const metric = createMockMetric({
        id: 42,
        dimensions: [
          createMockMetricDimension({
            id: defaultDimensionId,
            display_name: "Product Category",
            effective_type: "type/Text",
            semantic_type: "type/Category",
            default: true,
            status: "status/active",
          }),
        ],
        dimension_mappings: [
          {
            dimension_id: defaultDimensionId,
            table_id: PRODUCTS_ID,
            target: [
              "field",
              { "source-field": ORDERS.PRODUCT_ID },
              PRODUCTS.CATEGORY,
            ],
          },
        ],
      });
      const categoryDataset = createMockDataset({
        data: createMockDatasetData({
          cols: [
            createMockColumn({
              name: "category",
              base_type: "type/Text",
              semantic_type: "type/Category",
            }),
            createMockNumericColumn({ name: "count" }),
          ],
          rows: [
            ["Doohickey", 40],
            ["Gadget", 60],
          ],
        }),
      });

      setup(
        makeMetricCard([
          createMockField({ name: "created_at", base_type: "type/DateTime" }),
          createMockField({ name: "count", base_type: "type/Integer" }),
        ]),
        TIME_SERIES,
        { metric, metricDataset: categoryDataset },
      );

      expect(await getMetricDatasetRequest()).toEqual({
        definition: expect.objectContaining({
          projections: [
            expect.objectContaining({
              projection: [
                ["dimension", expect.any(Object), defaultDimensionId],
              ],
            }),
          ],
        }),
      });
      expect(
        fetchMock.callHistory.calls("path:/api/card/42/query"),
      ).toHaveLength(0);
      expect(
        screen.queryByTestId("metric-value-preview"),
      ).not.toBeInTheDocument();
    });

    it("uses the curated time dimension for the value preview", async () => {
      const defaultDimensionId = "created-at";
      const metric = createMockMetric({
        id: 42,
        dimensions: [
          createMockMetricDimension({
            id: defaultDimensionId,
            display_name: "Created At",
            effective_type: "type/DateTime",
            semantic_type: "type/CreationTimestamp",
            default: true,
            status: "status/active",
          }),
        ],
        dimension_mappings: [
          {
            dimension_id: defaultDimensionId,
            table_id: ORDERS_ID,
            target: ["field", {}, ORDERS.CREATED_AT],
          },
        ],
      });

      setup(makeMetricCard([createMockField({ name: "count" })]), undefined, {
        metric,
        metricDataset: TIME_SERIES,
      });

      expect(
        await screen.findByTestId("metric-value-preview"),
      ).toHaveTextContent("150");
      expect(await getMetricDatasetRequest()).toEqual({
        definition: expect.objectContaining({
          projections: [
            expect.objectContaining({
              projection: [
                ["dimension", expect.any(Object), defaultDimensionId],
              ],
            }),
          ],
        }),
      });
      expect(
        fetchMock.callHistory.calls("path:/api/card/42/query"),
      ).toHaveLength(0);
    });

    it("changes the chart when a curated dimension is selected (UXW-4772)", async () => {
      const defaultDimensionId = "created-at";
      const categoryDimensionId = "product-category";
      const metric = createMockMetric({
        id: 42,
        dimensions: [
          createMockMetricDimension({
            id: defaultDimensionId,
            display_name: "Created At",
            effective_type: "type/DateTime",
            semantic_type: "type/CreationTimestamp",
            default: true,
            status: "status/active",
          }),
          createMockMetricDimension({
            id: categoryDimensionId,
            display_name: "Product Category",
            effective_type: "type/Text",
            semantic_type: "type/Category",
            status: "status/active",
          }),
        ],
        dimension_mappings: [
          {
            dimension_id: defaultDimensionId,
            table_id: ORDERS_ID,
            target: ["field", {}, ORDERS.CREATED_AT],
          },
          {
            dimension_id: categoryDimensionId,
            table_id: PRODUCTS_ID,
            target: [
              "field",
              { "source-field": ORDERS.PRODUCT_ID },
              PRODUCTS.CATEGORY,
            ],
          },
        ],
      });

      setup(makeMetricCard([createMockField({ name: "count" })]), undefined, {
        metric,
        metricDataset: TIME_SERIES,
      });

      const dimensionSelect = await screen.findByRole("button", {
        name: "Dimension",
      });
      expect(dimensionSelect).toHaveTextContent("Created At");

      await userEvent.click(dimensionSelect);
      const categoryOption = await screen.findByRole("option", {
        name: /Product Category/,
      });
      expect(categoryOption).toContainElement(
        within(categoryOption).getByLabelText("string icon"),
      );
      await userEvent.click(categoryOption);

      await waitFor(() => {
        expect(fetchMock.callHistory.calls("metric-dataset")).toHaveLength(2);
      });
      expect(
        await fetchMock.callHistory.lastCall("metric-dataset")?.request?.json(),
      ).toEqual({
        definition: expect.objectContaining({
          projections: [
            expect.objectContaining({
              projection: [
                ["dimension", expect.any(Object), categoryDimensionId],
              ],
            }),
          ],
        }),
      });
    });

    it("shows the bin count for the selected numeric dimension", async () => {
      const dimensionId = "quantity";
      const metric = createMockMetric({
        id: 42,
        dimensions: [
          createMockMetricDimension({
            id: dimensionId,
            display_name: "Quantity",
            effective_type: "type/Integer",
            semantic_type: "type/Quantity",
            default: true,
            status: "status/active",
          }),
        ],
        dimension_mappings: [
          {
            dimension_id: dimensionId,
            table_id: ORDERS_ID,
            target: ["field", {}, ORDERS.QUANTITY],
          },
        ],
      });

      setup(makeMetricCard([createMockField({ name: "count" })]), undefined, {
        metric,
        metricDataset: BINNED_NUMERIC_DATASET,
      });

      const dimensionSelect = await screen.findByRole("button", {
        name: "Dimension",
      });
      expect(dimensionSelect).toHaveTextContent("Quantity: 8 bins");

      await userEvent.click(dimensionSelect);
      const quantityOption = await screen.findByRole("option", {
        name: /Quantity/,
      });
      expect(quantityOption).toHaveTextContent("Quantity");
      expect(quantityOption).not.toHaveTextContent("8 bins");
    });
  });

  /**
   * The value preview (latest value + period-over-period change) only renders
   * for a time series, so its presence/absence tells us which branch was chosen.
   */
  describe("value + change-over-time preview", () => {
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
      expect(
        fetchMock.callHistory.calls("path:/api/card/42/query"),
      ).toHaveLength(1);
      expect(
        fetchMock.callHistory.calls("path:/api/metric/dataset"),
      ).toHaveLength(0);
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
