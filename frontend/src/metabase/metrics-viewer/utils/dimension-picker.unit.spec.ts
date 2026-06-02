import type {
  MetricSourceId,
  MetricsViewerDimensionBreakoutState,
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
  getComparableDimensionMapping,
  getExistingDimensionBreakoutDimensionIds,
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
    dimensionBreakoutInfo: {
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
    dimensionBreakoutInfo: {
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
    dimensionBreakoutInfo: {
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
    dimensionBreakoutInfo: {
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
    dimensionBreakoutInfo: {
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
    dimensionBreakoutInfo: {
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
            dimensionBreakoutInfo: {
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
            dimensionBreakoutInfo: {
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

    const labels = allDimensions.map((d) => d.dimensionBreakoutInfo.label);
    expect(labels).toEqual([...new Set(labels)]);

    for (const dim of allDimensions) {
      const dimId = Object.values(
        dim.dimensionBreakoutInfo.dimensionMapping,
      )[0];
      expect(dim.dimensionBreakoutInfo.dimensionMapping).toEqual({
        0: dimId,
        1: dimId,
      });
    }
  });

  it("filters out dimensions whose id matches existingDimensionBreakoutDimensionIds", () => {
    const allIds = REVENUE_DIMENSIONS.flatMap((dimension) =>
      Object.values(dimension.dimensionBreakoutInfo.dimensionMapping),
    ).filter((id): id is string => id != null);

    const result = getAvailableDimensionsForPicker(
      { [REVENUE_SOURCE_ID]: revenueDefinition },
      [REVENUE_SOURCE_ID],
      [{ slotIndex: 0, entityIndex: 0, sourceId: REVENUE_SOURCE_ID }],
      new Set(allIds),
    );

    expect(result).toEqual({ shared: [], bySource: {} });
  });
});

describe("getExistingDimensionBreakoutDimensionIds", () => {
  const dimensionBreakouts: MetricsViewerDimensionBreakoutState[] = [
    {
      id: "dimensionBreakout-category",
      type: "category",
      label: "Category",
      display: "bar",
      dimensionMapping: { 0: "dim-category" },
      projectionConfig: {},
    },
    {
      id: "dimensionBreakout-created-at",
      type: "time",
      label: "Created At",
      display: "line",
      dimensionMapping: { 0: "dim-created-at", 1: null },
      projectionConfig: {},
    },
  ];

  it("returns dimension ids from every dimensionBreakout", () => {
    expect(
      getExistingDimensionBreakoutDimensionIds(dimensionBreakouts),
    ).toEqual(new Set(["dim-category", "dim-created-at"]));
  });

  it("can exclude the active dimensionBreakout ids", () => {
    expect(
      getExistingDimensionBreakoutDimensionIds(
        dimensionBreakouts,
        "dimensionBreakout-category",
      ),
    ).toEqual(new Set(["dim-created-at"]));
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
            dimensionBreakoutInfo: {
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
            dimensionBreakoutInfo: {
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
    });

    expect(categories.map((category) => category.name)).toEqual([
      "Time",
      "Category",
      "Is Active",
    ]);
    expect(categories.find((category) => category.name === "Time")).toEqual(
      expect.objectContaining({
        dimensionBreakoutInfo: {
          type: "time",
          label: "Time",
          dimensionMapping: { 0: "dim-created-at" },
        },
        targetItems: [
          expect.objectContaining({
            name: "Created At",
            dimensionBreakoutInfo: REVENUE_DIMENSIONS[2].dimensionBreakoutInfo,
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
              dimensionBreakoutInfo: {
                type: "category",
                label: "Address",
                dimensionMapping: { 0: "dim-address" },
              },
            },
            {
              icon: "label",
              isPreferred: true,
              dimensionBreakoutInfo: {
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
    });

    expect(categories.map((category) => category.name)).toEqual(["Category"]);
  });

  it("groups time fields across tables when every metric slot has one", () => {
    const categories = buildDimensionPickerSidebarCategories({
      availableDimensions: {
        shared: [],
        bySource: {
          [REVENUE_SOURCE_ID]: [
            {
              icon: "calendar",
              group: { id: "orders", type: "main", displayName: "Orders" },
              dimensionBreakoutInfo: {
                type: "time",
                label: "Created At",
                dimensionMapping: { 0: "dim-orders-created-at" },
              },
            },
          ],
          [ORDERS_SOURCE_ID]: [
            {
              icon: "calendar",
              group: { id: "users", type: "main", displayName: "Users" },
              dimensionBreakoutInfo: {
                type: "time",
                label: "Birth Date",
                dimensionMapping: { 1: "dim-users-birth-date" },
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
      metricSlots: [
        { slotIndex: 0, entityIndex: 0, sourceId: REVENUE_SOURCE_ID },
        { slotIndex: 1, entityIndex: 1, sourceId: ORDERS_SOURCE_ID },
      ],
    });

    expect(categories).toEqual([
      expect.objectContaining({
        name: "Time",
        dimensionBreakoutInfo: expect.objectContaining({
          type: "time",
          label: "Time",
          dimensionMapping: {
            0: "dim-orders-created-at",
            1: "dim-users-birth-date",
          },
        }),
      }),
    ]);
  });

  it("groups country fields across tables when every metric slot has one", () => {
    const categories = buildDimensionPickerSidebarCategories({
      availableDimensions: {
        shared: [],
        bySource: {
          [REVENUE_SOURCE_ID]: [
            {
              icon: "location",
              geoSubtype: "country",
              group: { id: "products", type: "main", displayName: "Products" },
              dimensionBreakoutInfo: {
                type: "geo",
                label: "Product Country",
                dimensionMapping: { 0: "dim-product-country" },
              },
            },
          ],
          [ORDERS_SOURCE_ID]: [
            {
              icon: "location",
              geoSubtype: "country",
              group: { id: "users", type: "main", displayName: "Users" },
              dimensionBreakoutInfo: {
                type: "geo",
                label: "User Country",
                dimensionMapping: { 1: "dim-user-country" },
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
      metricSlots: [
        { slotIndex: 0, entityIndex: 0, sourceId: REVENUE_SOURCE_ID },
        { slotIndex: 1, entityIndex: 1, sourceId: ORDERS_SOURCE_ID },
      ],
    });

    expect(categories).toEqual([
      expect.objectContaining({
        name: "Country",
        targetItems: [
          expect.objectContaining({ name: "Product Country" }),
          expect.objectContaining({ name: "User Country" }),
        ],
        dimensionBreakoutInfo: expect.objectContaining({
          type: "geo",
          label: "Country",
          dimensionMapping: {
            0: "dim-product-country",
            1: "dim-user-country",
          },
        }),
      }),
    ]);
  });

  it("does not show same-named category fields from different tables as shared", () => {
    const categories = buildDimensionPickerSidebarCategories({
      availableDimensions: {
        shared: [],
        bySource: {
          [REVENUE_SOURCE_ID]: [
            {
              icon: "label",
              group: { id: "users", type: "main", displayName: "Users" },
              isPreferred: true,
              dimensionBreakoutInfo: {
                type: "category",
                label: "Name",
                dimensionMapping: { 0: "dim-user-name" },
              },
            },
          ],
          [ORDERS_SOURCE_ID]: [
            {
              icon: "label",
              group: { id: "products", type: "main", displayName: "Products" },
              isPreferred: true,
              dimensionBreakoutInfo: {
                type: "category",
                label: "Name",
                dimensionMapping: { 1: "dim-product-name" },
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
      metricSlots: [
        { slotIndex: 0, entityIndex: 0, sourceId: REVENUE_SOURCE_ID },
        { slotIndex: 1, entityIndex: 1, sourceId: ORDERS_SOURCE_ID },
      ],
    });

    expect(categories).toEqual([]);
  });

  it("shows exact same table and column category fields across all metrics", () => {
    const categories = buildDimensionPickerSidebarCategories({
      availableDimensions: {
        shared: [],
        bySource: {
          [REVENUE_SOURCE_ID]: [
            {
              icon: "label",
              group: { id: "users", type: "main", displayName: "Users" },
              isPreferred: true,
              dimensionBreakoutInfo: {
                type: "category",
                label: "Name",
                dimensionMapping: { 0: "dim-user-name" },
              },
            },
          ],
          [ORDERS_SOURCE_ID]: [
            {
              icon: "label",
              group: { id: "users", type: "main", displayName: "Users" },
              isPreferred: true,
              dimensionBreakoutInfo: {
                type: "category",
                label: "Name",
                dimensionMapping: { 1: "dim-user-name" },
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
      metricSlots: [
        { slotIndex: 0, entityIndex: 0, sourceId: REVENUE_SOURCE_ID },
        { slotIndex: 1, entityIndex: 1, sourceId: ORDERS_SOURCE_ID },
      ],
    });

    expect(categories).toEqual([
      expect.objectContaining({
        name: "Name",
        dimensionBreakoutInfo: expect.objectContaining({
          type: "category",
          label: "Name",
          dimensionMapping: { 0: "dim-user-name", 1: "dim-user-name" },
        }),
      }),
    ]);
  });

  it("hides categories that do not match every metric slot", () => {
    const categories = buildDimensionPickerSidebarCategories({
      availableDimensions: {
        shared: [],
        bySource: {
          [REVENUE_SOURCE_ID]: [
            {
              icon: "calendar",
              dimensionBreakoutInfo: {
                type: "time",
                label: "Created At",
                dimensionMapping: { 0: "dim-created-at" },
              },
            },
          ],
          [ORDERS_SOURCE_ID]: [
            {
              icon: "calendar",
              dimensionBreakoutInfo: {
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
      metricSlots: [
        { slotIndex: 0, entityIndex: 0, sourceId: REVENUE_SOURCE_ID },
        { slotIndex: 1, entityIndex: 1, sourceId: ORDERS_SOURCE_ID },
        { slotIndex: 2, entityIndex: 2, sourceId: "metric:4" },
      ],
    });

    expect(categories).toEqual([]);
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
              dimensionBreakoutInfo: {
                type: "time",
                label: "Created At",
                dimensionMapping: { 0: "dim-created-at" },
              },
            },
            {
              icon: "calendar",
              dimensionBreakoutInfo: {
                type: "time",
                label: "Order Date",
                dimensionMapping: { 0: "dim-order-date" },
              },
            },
          ],
          [ORDERS_SOURCE_ID]: [
            {
              icon: "calendar",
              dimensionBreakoutInfo: {
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
    });
    const timeCategory = categories.find(
      (category) => category.name === "Time",
    );

    expect(timeCategory).toBeDefined();

    const rows = buildDimensionPickerSidebarCategorySelectRows({
      category: timeCategory!,
      activeDimensionBreakout: {
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
        isExpressionToken: false,
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
        isExpressionToken: false,
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
              dimensionBreakoutInfo: {
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
              dimensionBreakoutInfo: {
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
    });
    const timeCategory = categories.find(
      (category) => category.name === "Time",
    );

    const rows = buildDimensionPickerSidebarCategorySelectRows({
      category: timeCategory!,
      activeDimensionBreakout: {
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

  it("marks expression token rows", () => {
    const categories = buildDimensionPickerSidebarCategories({
      availableDimensions: {
        shared: [
          {
            icon: "calendar",
            dimensionBreakoutInfo: {
              type: "time",
              label: "Time",
              dimensionMapping: {
                0: "dim-revenue-created-at",
                1: "dim-orders-created-at",
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
      metricSlots: [
        {
          slotIndex: 0,
          entityIndex: 0,
          sourceId: REVENUE_SOURCE_ID,
          tokenPosition: 0,
        },
        {
          slotIndex: 1,
          entityIndex: 0,
          sourceId: ORDERS_SOURCE_ID,
          tokenPosition: 2,
        },
      ],
    });
    const timeCategory = categories.find(
      (category) => category.name === "Time",
    );

    expect(timeCategory).toBeDefined();

    const rows = buildDimensionPickerSidebarCategorySelectRows({
      category: timeCategory!,
      activeDimensionBreakout: {
        id: "time",
        type: "time",
        label: "Time",
        display: "line",
        dimensionMapping: {
          0: "dim-revenue-created-at",
          1: "dim-orders-created-at",
        },
        projectionConfig: {},
      },
      metricSlots: [
        {
          slotIndex: 0,
          entityIndex: 0,
          sourceId: REVENUE_SOURCE_ID,
          tokenPosition: 0,
        },
        {
          slotIndex: 1,
          entityIndex: 0,
          sourceId: ORDERS_SOURCE_ID,
          tokenPosition: 2,
        },
      ],
      sourceDataById: {
        [REVENUE_SOURCE_ID]: { type: "metric", name: "Revenue" },
        [ORDERS_SOURCE_ID]: { type: "metric", name: "Orders" },
      },
      sourceColors: { 0: ["#509ee3"] },
    });

    expect(rows.map((row) => row.isExpressionToken)).toEqual([true, true]);
  });
});

describe("getComparableDimensionMapping", () => {
  const metricSlots = [
    { slotIndex: 0, entityIndex: 0, sourceId: REVENUE_SOURCE_ID },
    { slotIndex: 1, entityIndex: 1, sourceId: ORDERS_SOURCE_ID },
  ];
  const activeDimensionBreakout = {
    id: "active-dimension-breakout",
    type: "time",
    label: "Time",
    display: "line",
    dimensionMapping: {},
    projectionConfig: {},
  } satisfies MetricsViewerDimensionBreakoutState;

  it("maps time fields across metric slots", () => {
    const selectedItem = {
      icon: "calendar",
      name: "Birth Date",
      group: { id: "users", type: "main", displayName: "Users" },
      dimensionBreakoutInfo: {
        type: "time" as const,
        label: "Birth Date",
        dimensionMapping: { 0: "dim-users-birth-date" },
      },
    } as const;

    expect(
      getComparableDimensionMapping({
        item: selectedItem,
        sections: [
          { items: [selectedItem], sourceId: REVENUE_SOURCE_ID },
          {
            items: [
              {
                icon: "calendar",
                name: "Created At",
                group: { id: "orders", type: "main", displayName: "Orders" },
                dimensionBreakoutInfo: {
                  type: "time",
                  label: "Created At",
                  dimensionMapping: { 1: "dim-orders-created-at" },
                },
              },
            ],
            sourceId: ORDERS_SOURCE_ID,
          },
        ],
        metricSlots,
        activeDimensionBreakout,
      }),
    ).toEqual({
      0: "dim-users-birth-date",
      1: "dim-orders-created-at",
    });
  });

  it("prefers same-named time fields when multiple time fields are comparable", () => {
    const selectedItem = {
      icon: "calendar",
      name: "Created At",
      group: { id: "accounts", type: "main", displayName: "Accounts" },
      dimensionBreakoutInfo: {
        type: "time" as const,
        label: "Created At",
        dimensionMapping: { 1: "dim-feedback-accounts-created-at" },
      },
    } as const;

    expect(
      getComparableDimensionMapping({
        item: selectedItem,
        sections: [
          {
            items: [
              {
                icon: "calendar",
                name: "Canceled At",
                group: {
                  id: "accounts",
                  type: "main",
                  displayName: "Accounts",
                },
                dimensionBreakoutInfo: {
                  type: "time",
                  label: "Canceled At",
                  dimensionMapping: { 0: "dim-revenue-accounts-canceled-at" },
                },
              },
              {
                icon: "calendar",
                name: "Created At",
                group: {
                  id: "accounts",
                  type: "main",
                  displayName: "Accounts",
                },
                dimensionBreakoutInfo: {
                  type: "time",
                  label: "Created At",
                  dimensionMapping: { 0: "dim-revenue-accounts-created-at" },
                },
              },
            ],
            sourceId: REVENUE_SOURCE_ID,
          },
          {
            items: [
              {
                icon: "calendar",
                name: "Canceled At",
                group: {
                  id: "accounts",
                  type: "main",
                  displayName: "Accounts",
                },
                dimensionBreakoutInfo: {
                  type: "time",
                  label: "Canceled At",
                  dimensionMapping: { 1: "dim-feedback-accounts-canceled-at" },
                },
              },
              selectedItem,
            ],
            sourceId: ORDERS_SOURCE_ID,
          },
        ],
        metricSlots,
        activeDimensionBreakout,
      }),
    ).toEqual({
      0: "dim-revenue-accounts-created-at",
      1: "dim-feedback-accounts-created-at",
    });
  });

  it("preserves another slot's compatible active time field", () => {
    const selectedItem = {
      icon: "calendar",
      name: "Birth Date",
      group: { id: "accounts", type: "main", displayName: "Accounts" },
      dimensionBreakoutInfo: {
        type: "time" as const,
        label: "Birth Date",
        dimensionMapping: { 0: "dim-revenue-accounts-birth-date" },
      },
    } as const;

    expect(
      getComparableDimensionMapping({
        item: selectedItem,
        sections: [
          {
            items: [
              selectedItem,
              {
                icon: "calendar",
                name: "Created At",
                group: {
                  id: "accounts",
                  type: "main",
                  displayName: "Accounts",
                },
                dimensionBreakoutInfo: {
                  type: "time",
                  label: "Created At",
                  dimensionMapping: { 0: "dim-revenue-accounts-created-at" },
                },
              },
            ],
            sourceId: REVENUE_SOURCE_ID,
          },
          {
            items: [
              {
                icon: "calendar",
                name: "Canceled At",
                group: {
                  id: "accounts",
                  type: "main",
                  displayName: "Accounts",
                },
                dimensionBreakoutInfo: {
                  type: "time",
                  label: "Canceled At",
                  dimensionMapping: { 1: "dim-feedback-accounts-canceled-at" },
                },
              },
              {
                icon: "calendar",
                name: "Created At",
                group: {
                  id: "accounts",
                  type: "main",
                  displayName: "Accounts",
                },
                dimensionBreakoutInfo: {
                  type: "time",
                  label: "Created At",
                  dimensionMapping: { 1: "dim-feedback-accounts-created-at" },
                },
              },
            ],
            sourceId: ORDERS_SOURCE_ID,
          },
        ],
        metricSlots,
        activeDimensionBreakout: {
          ...activeDimensionBreakout,
          dimensionMapping: { 1: "dim-feedback-accounts-created-at" },
        },
      }),
    ).toEqual({
      0: "dim-revenue-accounts-birth-date",
      1: "dim-feedback-accounts-created-at",
    });
  });

  it("preserves another slot's compatible active time field over a same-named fallback", () => {
    const selectedItem = {
      icon: "calendar",
      name: "Created At",
      group: { id: "accounts", type: "main", displayName: "Accounts" },
      dimensionBreakoutInfo: {
        type: "time" as const,
        label: "Created At",
        dimensionMapping: { 1: "dim-feedback-accounts-created-at" },
      },
    } as const;

    expect(
      getComparableDimensionMapping({
        item: selectedItem,
        sections: [
          {
            items: [
              {
                icon: "calendar",
                name: "Birth Date",
                group: {
                  id: "accounts",
                  type: "main",
                  displayName: "Accounts",
                },
                dimensionBreakoutInfo: {
                  type: "time",
                  label: "Birth Date",
                  dimensionMapping: { 0: "dim-revenue-accounts-birth-date" },
                },
              },
              {
                icon: "calendar",
                name: "Created At",
                group: {
                  id: "accounts",
                  type: "main",
                  displayName: "Accounts",
                },
                dimensionBreakoutInfo: {
                  type: "time",
                  label: "Created At",
                  dimensionMapping: { 0: "dim-revenue-accounts-created-at" },
                },
              },
            ],
            sourceId: REVENUE_SOURCE_ID,
          },
          {
            items: [selectedItem],
            sourceId: ORDERS_SOURCE_ID,
          },
        ],
        metricSlots,
        activeDimensionBreakout: {
          ...activeDimensionBreakout,
          dimensionMapping: { 0: "dim-revenue-accounts-birth-date" },
        },
      }),
    ).toEqual({
      0: "dim-revenue-accounts-birth-date",
      1: "dim-feedback-accounts-created-at",
    });
  });

  it("maps country fields across metric slots", () => {
    const selectedItem = {
      icon: "location",
      name: "Product Country",
      geoSubtype: "country" as const,
      group: { id: "products", type: "main", displayName: "Products" },
      dimensionBreakoutInfo: {
        type: "geo" as const,
        label: "Product Country",
        dimensionMapping: { 0: "dim-product-country" },
      },
    } as const;

    expect(
      getComparableDimensionMapping({
        item: selectedItem,
        sections: [
          { items: [selectedItem], sourceId: REVENUE_SOURCE_ID },
          {
            items: [
              {
                icon: "location",
                name: "User Country",
                geoSubtype: "country",
                group: { id: "users", type: "main", displayName: "Users" },
                dimensionBreakoutInfo: {
                  type: "geo",
                  label: "User Country",
                  dimensionMapping: { 1: "dim-user-country" },
                },
              },
            ],
            sourceId: ORDERS_SOURCE_ID,
          },
        ],
        metricSlots,
        activeDimensionBreakout,
      }),
    ).toEqual({
      0: "dim-product-country",
      1: "dim-user-country",
    });
  });

  it("does not map same-named category fields from different tables", () => {
    const selectedItem = {
      icon: "label",
      name: "Name",
      group: { id: "users", type: "main", displayName: "Users" },
      dimensionBreakoutInfo: {
        type: "category" as const,
        label: "Name",
        dimensionMapping: { 0: "dim-user-name" },
      },
    } as const;

    expect(
      getComparableDimensionMapping({
        item: selectedItem,
        sections: [
          { items: [selectedItem], sourceId: REVENUE_SOURCE_ID },
          {
            items: [
              {
                icon: "label",
                name: "Name",
                group: {
                  id: "products",
                  type: "main",
                  displayName: "Products",
                },
                dimensionBreakoutInfo: {
                  type: "category",
                  label: "Name",
                  dimensionMapping: { 1: "dim-product-name" },
                },
              },
            ],
            sourceId: ORDERS_SOURCE_ID,
          },
        ],
        metricSlots,
        activeDimensionBreakout,
      }),
    ).toEqual({ 0: "dim-user-name", 1: null });
  });

  it.each([
    ["Address", "dim-revenue-user-address"],
    ["Name", "dim-revenue-user-name"],
  ])(
    "does not preserve an incompatible active field when selecting %s",
    (fieldName, fieldId) => {
      const selectedItem = {
        icon: "label",
        name: fieldName,
        group: { id: "users", type: "main", displayName: "Users" },
        dimensionBreakoutInfo: {
          type: "category" as const,
          label: fieldName,
          dimensionMapping: { 0: fieldId },
        },
      } as const;

      expect(
        getComparableDimensionMapping({
          item: selectedItem,
          sections: [
            { items: [selectedItem], sourceId: REVENUE_SOURCE_ID },
            {
              items: [
                {
                  icon: "label",
                  name: "Email",
                  group: {
                    id: "accounts",
                    type: "main",
                    displayName: "Accounts",
                  },
                  dimensionBreakoutInfo: {
                    type: "category",
                    label: "Email",
                    dimensionMapping: { 1: "dim-accounts-email" },
                  },
                },
              ],
              sourceId: ORDERS_SOURCE_ID,
            },
          ],
          metricSlots,
          activeDimensionBreakout: {
            ...activeDimensionBreakout,
            type: "category",
            label: "Email",
            display: "bar",
            dimensionMapping: { 1: "dim-accounts-email" },
          },
        }),
      ).toEqual({ 0: fieldId, 1: null });
    },
  );

  it("does not map same-typed numeric fields from different tables", () => {
    const selectedItem = {
      icon: "int",
      name: "Total",
      group: { id: "orders", type: "main", displayName: "Orders" },
      dimensionBreakoutInfo: {
        type: "numeric" as const,
        label: "Total",
        dimensionMapping: { 0: "dim-orders-total" },
      },
    } as const;

    expect(
      getComparableDimensionMapping({
        item: selectedItem,
        sections: [
          { items: [selectedItem], sourceId: REVENUE_SOURCE_ID },
          {
            items: [
              {
                icon: "int",
                name: "Price",
                group: {
                  id: "products",
                  type: "main",
                  displayName: "Products",
                },
                dimensionBreakoutInfo: {
                  type: "numeric",
                  label: "Price",
                  dimensionMapping: { 1: "dim-products-price" },
                },
              },
            ],
            sourceId: ORDERS_SOURCE_ID,
          },
        ],
        metricSlots,
        activeDimensionBreakout,
      }),
    ).toEqual({ 0: "dim-orders-total", 1: null });
  });

  it("maps exact same table and column category fields across metric slots", () => {
    const selectedItem = {
      icon: "label",
      name: "Name",
      group: { id: "users", type: "main", displayName: "Users" },
      dimensionBreakoutInfo: {
        type: "category" as const,
        label: "Name",
        dimensionMapping: { 0: "dim-user-name" },
      },
    } as const;

    expect(
      getComparableDimensionMapping({
        item: selectedItem,
        sections: [
          { items: [selectedItem], sourceId: REVENUE_SOURCE_ID },
          {
            items: [
              {
                icon: "label",
                name: "Name",
                group: { id: "users", type: "main", displayName: "Users" },
                dimensionBreakoutInfo: {
                  type: "category",
                  label: "Name",
                  dimensionMapping: { 1: "dim-user-name" },
                },
              },
            ],
            sourceId: ORDERS_SOURCE_ID,
          },
        ],
        metricSlots,
        activeDimensionBreakout,
      }),
    ).toEqual({ 0: "dim-user-name", 1: "dim-user-name" });
  });
});
