import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupAdhocQueryMetadataEndpoint,
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
  setupDatabaseEndpoints,
  setupMetricDatasetEndpoint,
  setupMetricDimensionsEndpoints,
  setupMetricEndpoint,
  setupRevisionsEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import type {
  Card,
  Dataset,
  DimensionMapping,
  Field,
  Metric,
} from "metabase-types/api";
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
    rows: [[150]],
  }),
});

const TIME_SERIES = createMockDataset({
  data: createMockDatasetData({
    cols: [
      createMockColumn({
        name: "created_at",
        display_name: "Created At: Month",
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
  showManagementPanels?: boolean;
}

function setup(
  card: Card,
  dataset: Dataset = SCALAR_DATASET,
  { metric, metricDataset, showManagementPanels }: SetupOptions = {},
) {
  setupDatabaseEndpoints(SAMPLE_DB);
  setupCardEndpoints(card);
  const metadata = createMockCardQueryMetadata({ databases: [SAMPLE_DB] });
  setupCardQueryMetadataEndpoint(card, metadata);
  setupMetricEndpoint(
    metric ?? createMockMetric({ id: card.id, name: card.name }),
  );
  setupMetricDatasetEndpoint(metricDataset ?? dataset);
  // Data Studio also renders the Dimensions and History panels.
  setupMetricDimensionsEndpoints(card.id, { added: [], addable: [] });
  setupRevisionsEndpoints([]);
  setupAdhocQueryMetadataEndpoint(metadata);

  renderWithProviders(
    <Route
      path="/"
      element={
        <MetricAbout
          card={card}
          metadata={metadata}
          urls={mockUrls}
          showManagementPanels={showManagementPanels}
        />
      }
    />,
    {
      storeInitialState: createMockState(),
      withRouter: true,
      initialRoute: "/",
    },
  );
}

async function getMetricDatasetRequests(): Promise<unknown[]> {
  await waitFor(() => {
    expect(
      fetchMock.callHistory.calls("metric-dataset").length,
    ).toBeGreaterThan(0);
  });

  return Promise.all(
    fetchMock.callHistory
      .calls("metric-dataset")
      .map((call) => call.request?.json()),
  );
}

async function getMetricDatasetRequest(): Promise<unknown> {
  const requests = await getMetricDatasetRequests();
  return requests.at(-1);
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

  it("collapses the definition by default and expands it on click", async () => {
    setup(
      makeMetricCard([
        createMockField({ name: "count", base_type: "type/Integer" }),
      ]),
    );

    const toggle = await screen.findByRole("button", { name: /Definition/ });
    const definition = await screen.findByTestId("metric-definition");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(definition).not.toBeVisible();

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(definition).toBeVisible());
  });

  it("hides the Dimensions and History panels on the main app page", async () => {
    setup(
      makeMetricCard([
        createMockField({ name: "count", base_type: "type/Integer" }),
      ]),
    );

    expect(
      await screen.findByRole("button", { name: /Definition/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Dimensions")).not.toBeInTheDocument();
    expect(screen.queryByText("History")).not.toBeInTheDocument();
  });

  it("shows the Dimensions and History panels when showManagementPanels is set", async () => {
    setup(
      makeMetricCard([
        createMockField({ name: "count", base_type: "type/Integer" }),
      ]),
      undefined,
      { showManagementPanels: true },
    );

    expect(await screen.findByText("Dimensions")).toBeInTheDocument();
    expect(await screen.findByText("History")).toBeInTheDocument();
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

    it("preserves a curated joined-field label when showing a time bucket (UXW-4945)", async () => {
      const defaultDimensionId = "created-at";
      const categoryDimensionId = "product-category";
      const metric = createMockMetric({
        id: 42,
        dimensions: [
          createMockMetricDimension({
            id: defaultDimensionId,
            display_name: "Product - Created At",
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
            table_id: PRODUCTS_ID,
            target: [
              "field",
              { "source-field": ORDERS.PRODUCT_ID },
              PRODUCTS.CREATED_AT,
            ],
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
      const metricDataset = createMockDataset({
        data: createMockDatasetData({
          cols: [
            createMockColumn({
              name: "created_at",
              display_name: "Product → Created At: Day",
              base_type: "type/DateTime",
              unit: "day",
            }),
            createMockNumericColumn({ name: "count" }),
          ],
          rows: [
            ["2024-01-01T00:00:00Z", 100],
            ["2024-01-02T00:00:00Z", 150],
          ],
        }),
      });

      setup(makeMetricCard([createMockField({ name: "count" })]), undefined, {
        metric,
        metricDataset,
      });

      expect(
        await screen.findByRole("button", {
          name: /Product - Created At: Day/,
          pressed: true,
        }),
      ).toBeInTheDocument();

      await userEvent.click(
        await screen.findByRole("button", { name: /Product Category/ }),
      );

      expect(
        await screen.findByRole("button", {
          name: /Product Category/,
          pressed: true,
        }),
      ).toBeInTheDocument();

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

    it("preserves a curated joined-field label when showing numeric bins (UXW-4945)", async () => {
      const dimensionId = "product-rating";
      const metric = createMockMetric({
        id: 42,
        dimensions: [
          createMockMetricDimension({
            id: dimensionId,
            display_name: "Product - Rating",
            effective_type: "type/Float",
            semantic_type: "type/Quantity",
            default: true,
            status: "status/active",
          }),
        ],
        dimension_mappings: [
          {
            dimension_id: dimensionId,
            table_id: PRODUCTS_ID,
            target: [
              "field",
              { "source-field": ORDERS.PRODUCT_ID },
              PRODUCTS.RATING,
            ],
          },
        ],
      });
      const metricDataset = createMockDataset({
        data: createMockDatasetData({
          cols: [
            createMockColumn({
              ...BINNED_NUMERIC_DATASET.data.cols[0],
              name: "rating",
              display_name: "Product → Rating: 8 bins",
              base_type: "type/Float",
              effective_type: "type/Float",
            }),
            createMockNumericColumn({ name: "count" }),
          ],
          rows: BINNED_NUMERIC_DATASET.data.rows,
        }),
      });

      setup(makeMetricCard([createMockField({ name: "count" })]), undefined, {
        metric,
        metricDataset,
      });

      const activePill = await screen.findByRole("button", {
        name: /Product - Rating: 8 bins/,
        pressed: true,
      });
      expect(activePill).toHaveTextContent("Product - Rating: 8 bins");
    });

    it("limits break-out pills like the breakdowns grid while keeping the default visible", async () => {
      const categoryFields = [
        { id: "product-category", name: "Category", field: PRODUCTS.CATEGORY },
        { id: "product-vendor", name: "Vendor", field: PRODUCTS.VENDOR },
        { id: "product-title", name: "Title", field: PRODUCTS.TITLE },
        { id: "product-ean", name: "Ean", field: PRODUCTS.EAN },
        { id: "product-id", name: "Product ID", field: PRODUCTS.ID },
      ];
      const defaultDimensionId = "created-at";
      const metric = createMockMetric({
        id: 42,
        dimensions: [
          ...categoryFields.map(({ id, name }) =>
            createMockMetricDimension({
              id,
              display_name: name,
              effective_type: "type/Text",
              semantic_type: "type/Category",
              status: "status/active",
            }),
          ),
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
          ...categoryFields.map(
            ({ id, field }): DimensionMapping => ({
              dimension_id: id,
              table_id: PRODUCTS_ID,
              target: ["field", { "source-field": ORDERS.PRODUCT_ID }, field],
            }),
          ),
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

      const pills = await screen.findByRole("group", { name: "Break out by" });
      expect(
        await screen.findByRole("button", {
          name: /Created At/,
          pressed: true,
        }),
      ).toBeInTheDocument();
      for (const name of ["Category", "Vendor", "Title", "Ean"]) {
        expect(
          screen.getByRole("button", { name: new RegExp(`${name}$`) }),
        ).toBeInTheDocument();
      }
      expect(
        screen.queryByRole("button", { name: /Product ID$/ }),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /Show more/ }));

      expect(
        await screen.findByRole("button", { name: /Product ID$/ }),
      ).toBeInTheDocument();
      expect(pills).not.toHaveTextContent("Show more");
      expect(screen.queryByText("Breakdowns")).not.toBeInTheDocument();
    });
  });

  describe("scalar fallback", () => {
    it("shows a scalar when the curated default cannot be charted", async () => {
      setup(
        makeMetricCard([
          createMockField({ name: "created_at", base_type: "type/DateTime" }),
          createMockField({ name: "count", base_type: "type/Integer" }),
        ]),
        TIME_SERIES,
        {
          metric: createMockMetric({
            id: 42,
            dimensions: [
              createMockMetricDimension({
                id: "user-id",
                effective_type: "type/Integer",
                semantic_type: "type/FK",
                default: true,
                status: "status/active",
              }),
            ],
            dimension_mappings: [
              {
                dimension_id: "user-id",
                table_id: ORDERS_ID,
                target: ["field", {}, ORDERS.USER_ID],
              },
            ],
          }),
          metricDataset: SCALAR_DATASET,
        },
      );

      expect(await screen.findByTestId("scalar-value")).toHaveTextContent(
        "150",
      );
      expect(
        fetchMock.callHistory.calls("path:/api/card/42/query"),
      ).toHaveLength(0);
      expect(await getMetricDatasetRequest()).toEqual(
        expect.objectContaining({
          definition: expect.not.objectContaining({
            projections: expect.anything(),
          }),
        }),
      );
    });

    it("shows a scalar when curated dimensions exist but none is the default", async () => {
      const dimensionId = "created-at";
      const metric = createMockMetric({
        id: 42,
        dimensions: [
          createMockMetricDimension({
            id: dimensionId,
            display_name: "Created At",
            effective_type: "type/DateTime",
            semantic_type: "type/CreationTimestamp",
            default: false,
            status: "status/active",
          }),
        ],
        dimension_mappings: [
          {
            dimension_id: dimensionId,
            table_id: ORDERS_ID,
            target: ["field", {}, ORDERS.CREATED_AT],
          },
        ],
      });

      setup(
        makeMetricCard([
          createMockField({ name: "created_at", base_type: "type/DateTime" }),
          createMockField({ name: "count", base_type: "type/Integer" }),
        ]),
        TIME_SERIES,
        { metric, metricDataset: SCALAR_DATASET },
      );

      expect(await screen.findByTestId("scalar-value")).toHaveTextContent(
        "150",
      );
      // The dimension is offered as a pill but nothing is broken out by it yet.
      expect(
        screen.queryByRole("button", { pressed: true }),
      ).not.toBeInTheDocument();
      expect(await getMetricDatasetRequests()).toContainEqual(
        expect.objectContaining({
          definition: expect.not.objectContaining({
            projections: expect.anything(),
          }),
        }),
      );
    });

    it("shows a scalar when there are no curated dimensions", async () => {
      setup(
        makeMetricCard([
          createMockField({ name: "created_at", base_type: "type/DateTime" }),
          createMockField({ name: "count", base_type: "type/Integer" }),
        ]),
        TIME_SERIES,
        {
          metric: createMockMetric({ id: 42, dimensions: [] }),
          metricDataset: SCALAR_DATASET,
        },
      );

      expect(await screen.findByTestId("scalar-value")).toHaveTextContent(
        "150",
      );
      expect(
        screen.queryByRole("group", { name: "Break out by" }),
      ).not.toBeInTheDocument();
      expect(await getMetricDatasetRequests()).toContainEqual(
        expect.objectContaining({
          definition: expect.not.objectContaining({
            projections: expect.anything(),
          }),
        }),
      );
      expect(
        fetchMock.callHistory.calls("path:/api/card/42/query"),
      ).toHaveLength(0);
    });
  });
});
