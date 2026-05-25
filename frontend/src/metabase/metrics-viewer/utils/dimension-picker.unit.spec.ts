import type {
  MetricSourceId,
  MetricsViewerTabState,
} from "../types/viewer-state";

import {
  REVENUE_METRIC,
  createMetricMetadata,
  createMockMetricDimension,
  createMockNormalizedMetric,
  setupDefinition,
} from "./__tests__/test-helpers";
import {
  type AvailableDimension,
  buildDimensionPickerSections,
  buildDimensionPickerSidebarCategories,
  buildDimensionPickerSidebarCategorySelectRows,
  getAvailableDimensionsForPicker,
  getExistingTabDimensionIds,
} from "./dimension-picker";

const ORDERS_METRIC = createMockNormalizedMetric({
  id: 3,
  name: "Orders",
  dimensions: [
    createMockMetricDimension({
      id: "dim-created-at",
      display_name: "Created At",
      effective_type: "type/DateTime",
      semantic_type: "type/CreationTimestamp",
    }),
    createMockMetricDimension({
      id: "dim-status",
      display_name: "Status",
      effective_type: "type/Text",
      semantic_type: "type/Category",
    }),
  ],
});

const allMetadata = createMetricMetadata([REVENUE_METRIC, ORDERS_METRIC]);
const revenueDefinition = setupDefinition(allMetadata, REVENUE_METRIC.id);
const ordersDefinition = setupDefinition(allMetadata, ORDERS_METRIC.id);

const REVENUE_SOURCE_ID: MetricSourceId = `metric:${REVENUE_METRIC.id}`;
const ORDERS_SOURCE_ID: MetricSourceId = `metric:${ORDERS_METRIC.id}`;

const REVENUE_DIMENSIONS: AvailableDimension[] = [
  {
    icon: "int",
    group: undefined,
    canListValues: false,
    isPreferred: undefined,
    tabInfo: {
      type: "numeric",
      label: "Amount",
      dimensionMapping: { 0: "dim-amount" },
    },
  },
  {
    icon: "label",
    group: undefined,
    canListValues: false,
    isPreferred: true,
    tabInfo: {
      type: "category",
      label: "Category",
      dimensionMapping: { 0: "dim-category" },
    },
  },
  {
    icon: "calendar",
    group: undefined,
    canListValues: false,
    isPreferred: undefined,
    tabInfo: {
      type: "time",
      label: "Created At",
      dimensionMapping: { 0: "dim-created-at" },
    },
  },
  {
    icon: "io",
    group: undefined,
    canListValues: false,
    isPreferred: undefined,
    tabInfo: {
      type: "boolean",
      label: "Is Active",
      dimensionMapping: { 0: "dim-active" },
    },
  },
];

const ORDERS_DIMENSIONS: AvailableDimension[] = [
  {
    icon: "calendar",
    group: undefined,
    canListValues: false,
    isPreferred: undefined,
    tabInfo: {
      type: "time",
      label: "Created At",
      dimensionMapping: { 0: "dim-created-at" },
    },
  },
  {
    icon: "label",
    group: undefined,
    canListValues: false,
    isPreferred: true,
    tabInfo: {
      type: "category",
      label: "Status",
      dimensionMapping: { 0: "dim-status" },
    },
  },
];

describe("getAvailableDimensionsForPicker", () => {
  it("returns empty result for empty source order", () => {
    const result = getAvailableDimensionsForPicker({}, [], [], new Set());

    expect(result).toEqual({ shared: [], bySource: {} });
  });

  it("returns dimensions for a single metric source", () => {
    const result = getAvailableDimensionsForPicker(
      { [REVENUE_SOURCE_ID]: revenueDefinition },
      [REVENUE_SOURCE_ID],
      [{ slotIndex: 0, entityIndex: 0, sourceId: REVENUE_SOURCE_ID }],
      new Set(),
    );

    expect(result).toEqual({
      shared: [],
      bySource: {
        [REVENUE_SOURCE_ID]: REVENUE_DIMENSIONS,
      },
    });
  });

  it("returns dimensions for a second metric source", () => {
    const result = getAvailableDimensionsForPicker(
      { [ORDERS_SOURCE_ID]: ordersDefinition },
      [ORDERS_SOURCE_ID],
      [{ slotIndex: 0, entityIndex: 0, sourceId: ORDERS_SOURCE_ID }],
      new Set(),
    );

    expect(result).toEqual({
      shared: [],
      bySource: {
        [ORDERS_SOURCE_ID]: ORDERS_DIMENSIONS,
      },
    });
  });

  it("groups dimensions by source when multiple sources are provided", () => {
    const result = getAvailableDimensionsForPicker(
      {
        [REVENUE_SOURCE_ID]: revenueDefinition,
        [ORDERS_SOURCE_ID]: ordersDefinition,
      },
      [REVENUE_SOURCE_ID, ORDERS_SOURCE_ID],
      [
        { slotIndex: 0, entityIndex: 0, sourceId: REVENUE_SOURCE_ID },
        { slotIndex: 1, entityIndex: 1, sourceId: ORDERS_SOURCE_ID },
      ],
      new Set(),
    );

    expect(result).toEqual({
      shared: [],
      bySource: {
        [REVENUE_SOURCE_ID]: REVENUE_DIMENSIONS,
        [ORDERS_SOURCE_ID]: [
          {
            icon: "calendar",
            group: undefined,
            canListValues: false,
            isPreferred: undefined,
            tabInfo: {
              type: "time",
              label: "Created At",
              dimensionMapping: { 1: "dim-created-at" },
            },
          },
          {
            icon: "label",
            group: undefined,
            canListValues: false,
            isPreferred: true,
            tabInfo: {
              type: "category",
              label: "Status",
              dimensionMapping: { 1: "dim-status" },
            },
          },
        ],
      },
    });
  });

  it("does not duplicate dimensions when a metric appears in multiple slots", () => {
    const result = getAvailableDimensionsForPicker(
      { [REVENUE_SOURCE_ID]: revenueDefinition },
      [REVENUE_SOURCE_ID],
      [
        { slotIndex: 0, entityIndex: 0, sourceId: REVENUE_SOURCE_ID },
        { slotIndex: 1, entityIndex: 1, sourceId: REVENUE_SOURCE_ID },
      ],
      new Set(),
    );

    const allDimensions = result.bySource[REVENUE_SOURCE_ID] ?? [];
    expect(allDimensions).toHaveLength(REVENUE_DIMENSIONS.length);

    const labels = allDimensions.map((d) => d.tabInfo.label);
    expect(labels).toEqual([...new Set(labels)]);

    for (const dim of allDimensions) {
      const dimId = Object.values(dim.tabInfo.dimensionMapping)[0];
      expect(dim.tabInfo.dimensionMapping).toEqual({
        0: dimId,
        1: dimId,
      });
    }
  });

  it("filters out dimensions whose id matches existingTabDimensionIds", () => {
    const allIds = REVENUE_DIMENSIONS.flatMap((dimension) =>
      Object.values(dimension.tabInfo.dimensionMapping),
    );

    const result = getAvailableDimensionsForPicker(
      { [REVENUE_SOURCE_ID]: revenueDefinition },
      [REVENUE_SOURCE_ID],
      [{ slotIndex: 0, entityIndex: 0, sourceId: REVENUE_SOURCE_ID }],
      new Set(allIds),
    );

    expect(result).toEqual({ shared: [], bySource: {} });
  });
});

describe("getExistingTabDimensionIds", () => {
  const tabs: MetricsViewerTabState[] = [
    {
      id: "tab-category",
      type: "category",
      label: "Category",
      display: "bar",
      dimensionMapping: { 0: "dim-category" },
      projectionConfig: {},
    },
    {
      id: "tab-created-at",
      type: "time",
      label: "Created At",
      display: "line",
      dimensionMapping: { 0: "dim-created-at", 1: null },
      projectionConfig: {},
    },
  ];

  it("returns dimension ids from every tab", () => {
    expect(getExistingTabDimensionIds(tabs)).toEqual(
      new Set(["dim-category", "dim-created-at"]),
    );
  });

  it("can exclude the active tab ids", () => {
    expect(getExistingTabDimensionIds(tabs, "tab-category")).toEqual(
      new Set(["dim-created-at"]),
    );
  });
});

describe("buildDimensionPickerSections", () => {
  it("uses table names without a Shared prefix for grouped shared dimensions", () => {
    const sections = buildDimensionPickerSections({
      availableDimensions: {
        shared: [
          {
            icon: "label",
            group: { id: "customers", type: "main", displayName: "Customers" },
            tabInfo: {
              type: "category",
              label: "Customer Name",
              dimensionMapping: {
                0: "dim-customer-name",
                1: "dim-customer-name",
              },
            },
          },
          {
            icon: "calendar",
            group: { id: "orders", type: "main", displayName: "Orders" },
            tabInfo: {
              type: "time",
              label: "Created At",
              dimensionMapping: {
                0: "dim-created-at",
                1: "dim-created-at",
              },
            },
          },
        ],
        bySource: {},
      },
      sourceOrder: [REVENUE_SOURCE_ID, ORDERS_SOURCE_ID],
      sourceDataById: {
        [REVENUE_SOURCE_ID]: { type: "metric", name: "Revenue" },
        [ORDERS_SOURCE_ID]: { type: "metric", name: "Orders" },
      },
      hasMultipleSources: true,
    });

    expect(sections).toEqual([
      expect.objectContaining({ name: "Customers", isShared: true }),
      expect.objectContaining({ name: "Orders", isShared: true }),
    ]);
  });
});

describe("buildDimensionPickerSidebarCategories", () => {
  it("uses a canonical time row instead of raw time fields", () => {
    const categories = buildDimensionPickerSidebarCategories({
      availableDimensions: {
        shared: [],
        bySource: {
          [REVENUE_SOURCE_ID]: REVENUE_DIMENSIONS,
        },
      },
      sourceOrder: [REVENUE_SOURCE_ID],
      sourceDataById: {
        [REVENUE_SOURCE_ID]: { type: "metric", name: "Revenue" },
      },
      hasMultipleSources: false,
    });

    expect(categories.map((category) => category.name)).toEqual([
      "Time",
      "Category",
      "Is Active",
    ]);
    expect(categories.find((category) => category.name === "Time")).toEqual(
      expect.objectContaining({
        tabInfo: {
          type: "time",
          label: "Time",
          dimensionMapping: { 0: "dim-created-at" },
        },
        targetItems: [
          expect.objectContaining({
            name: "Created At",
            tabInfo: REVENUE_DIMENSIONS[2].tabInfo,
          }),
        ],
      }),
    );
  });

  it("excludes non-preferred raw category fields from the default view", () => {
    const categories = buildDimensionPickerSidebarCategories({
      availableDimensions: {
        shared: [],
        bySource: {
          [REVENUE_SOURCE_ID]: [
            {
              icon: "label",
              isPreferred: false,
              tabInfo: {
                type: "category",
                label: "Address",
                dimensionMapping: { 0: "dim-address" },
              },
            },
            {
              icon: "label",
              isPreferred: true,
              tabInfo: {
                type: "category",
                label: "Category",
                dimensionMapping: { 0: "dim-category" },
              },
            },
          ],
        },
      },
      sourceOrder: [REVENUE_SOURCE_ID],
      sourceDataById: {
        [REVENUE_SOURCE_ID]: { type: "metric", name: "Revenue" },
      },
      hasMultipleSources: false,
    });

    expect(categories.map((category) => category.name)).toEqual(["Category"]);
  });
});

describe("buildDimensionPickerSidebarCategorySelectRows", () => {
  it("builds one column select row per metric slot", () => {
    const categories = buildDimensionPickerSidebarCategories({
      availableDimensions: {
        shared: [],
        bySource: {
          [REVENUE_SOURCE_ID]: [
            {
              icon: "calendar",
              tabInfo: {
                type: "time",
                label: "Created At",
                dimensionMapping: { 0: "dim-created-at" },
              },
            },
            {
              icon: "calendar",
              tabInfo: {
                type: "time",
                label: "Order Date",
                dimensionMapping: { 0: "dim-order-date" },
              },
            },
          ],
          [ORDERS_SOURCE_ID]: [
            {
              icon: "calendar",
              tabInfo: {
                type: "time",
                label: "Placed At",
                dimensionMapping: { 1: "dim-placed-at" },
              },
            },
          ],
        },
      },
      sourceOrder: [REVENUE_SOURCE_ID, ORDERS_SOURCE_ID],
      sourceDataById: {
        [REVENUE_SOURCE_ID]: { type: "metric", name: "Revenue" },
        [ORDERS_SOURCE_ID]: { type: "metric", name: "Orders" },
      },
      hasMultipleSources: true,
    });
    const timeCategory = categories.find(
      (category) => category.name === "Time",
    );

    expect(timeCategory).toBeDefined();

    const rows = buildDimensionPickerSidebarCategorySelectRows({
      category: timeCategory!,
      activeTab: {
        id: "dim-created-at",
        type: "time",
        label: "Time",
        display: "line",
        dimensionMapping: { 0: "dim-created-at", 1: "dim-placed-at" },
        projectionConfig: {},
      },
      metricSlots: [
        { slotIndex: 0, entityIndex: 0, sourceId: REVENUE_SOURCE_ID },
        { slotIndex: 1, entityIndex: 1, sourceId: ORDERS_SOURCE_ID },
      ],
      sourceDataById: {
        [REVENUE_SOURCE_ID]: { type: "metric", name: "Revenue" },
        [ORDERS_SOURCE_ID]: { type: "metric", name: "Orders" },
      },
      sourceColors: { 0: ["#509ee3"], 1: ["#f9d45c"] },
    });

    expect(rows).toEqual([
      {
        slotIndex: 0,
        sourceId: REVENUE_SOURCE_ID,
        metricName: "Revenue",
        colors: ["#509ee3"],
        value: "dim-created-at",
        options: [
          { value: "dim-created-at", label: "Created At", icon: "calendar" },
          { value: "dim-order-date", label: "Order Date", icon: "calendar" },
        ],
      },
      {
        slotIndex: 1,
        sourceId: ORDERS_SOURCE_ID,
        metricName: "Orders",
        colors: ["#f9d45c"],
        value: "dim-placed-at",
        options: [
          { value: "dim-placed-at", label: "Placed At", icon: "calendar" },
        ],
      },
    ]);
  });

  it("prepends duplicate option labels with the table name", () => {
    const categories = buildDimensionPickerSidebarCategories({
      availableDimensions: {
        shared: [],
        bySource: {
          [REVENUE_SOURCE_ID]: [
            {
              icon: "calendar",
              group: { id: "orders", type: "main", displayName: "Orders" },
              tabInfo: {
                type: "time",
                label: "Created At",
                dimensionMapping: { 0: "dim-orders-created-at" },
              },
            },
            {
              icon: "calendar",
              group: {
                id: "products",
                type: "connection",
                displayName: "Products",
              },
              tabInfo: {
                type: "time",
                label: "Created At",
                dimensionMapping: { 0: "dim-products-created-at" },
              },
            },
          ],
        },
      },
      sourceOrder: [REVENUE_SOURCE_ID],
      sourceDataById: {
        [REVENUE_SOURCE_ID]: { type: "metric", name: "Revenue" },
      },
      hasMultipleSources: false,
    });
    const timeCategory = categories.find(
      (category) => category.name === "Time",
    );

    const rows = buildDimensionPickerSidebarCategorySelectRows({
      category: timeCategory!,
      activeTab: {
        id: "dim-orders-created-at",
        type: "time",
        label: "Time",
        display: "line",
        dimensionMapping: { 0: "dim-orders-created-at" },
        projectionConfig: {},
      },
      metricSlots: [
        { slotIndex: 0, entityIndex: 0, sourceId: REVENUE_SOURCE_ID },
      ],
      sourceDataById: {
        [REVENUE_SOURCE_ID]: { type: "metric", name: "Revenue" },
      },
      sourceColors: { 0: ["#509ee3"] },
    });

    expect(rows[0].options.map((option) => option.label)).toEqual([
      "Orders → Created At",
      "Products → Created At",
    ]);
  });
});
