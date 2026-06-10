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
  type DimensionPickerSidebarCategory,
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

describe("buildDimensionPickerSidebarCategorySelectRows", () => {
  it("builds one column select row per metric slot", () => {
    const timeCategory: DimensionPickerSidebarCategory = {
      key: "type:time",
      name: "Time",
      icon: "calendar",
      dimensionBreakoutInfo: {
        type: "time",
        label: "Time",
        dimensionMapping: { 0: "dim-created-at", 1: "dim-placed-at" },
      },
      targetItems: [
        {
          name: "Created At",
          icon: "calendar",
          dimensionBreakoutInfo: {
            type: "time",
            label: "Created At",
            dimensionMapping: { 0: "dim-created-at" },
          },
        },
        {
          name: "Order Date",
          icon: "calendar",
          dimensionBreakoutInfo: {
            type: "time",
            label: "Order Date",
            dimensionMapping: { 0: "dim-order-date" },
          },
        },
        {
          name: "Placed At",
          icon: "calendar",
          dimensionBreakoutInfo: {
            type: "time",
            label: "Placed At",
            dimensionMapping: { 1: "dim-placed-at" },
          },
        },
      ],
    };

    const rows = buildDimensionPickerSidebarCategorySelectRows({
      category: timeCategory,
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
    const timeCategory: DimensionPickerSidebarCategory = {
      key: "type:time",
      name: "Time",
      icon: "calendar",
      dimensionBreakoutInfo: {
        type: "time",
        label: "Time",
        dimensionMapping: { 0: "dim-orders-created-at" },
      },
      targetItems: [
        {
          name: "Created At",
          icon: "calendar",
          group: { id: "orders", type: "main", displayName: "Orders" },
          dimensionBreakoutInfo: {
            type: "time",
            label: "Created At",
            dimensionMapping: { 0: "dim-orders-created-at" },
          },
        },
        {
          name: "Created At",
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
    };

    const rows = buildDimensionPickerSidebarCategorySelectRows({
      category: timeCategory,
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
    const timeCategory: DimensionPickerSidebarCategory = {
      key: "type:time",
      name: "Time",
      icon: "calendar",
      dimensionBreakoutInfo: {
        type: "time",
        label: "Time",
        dimensionMapping: {
          0: "dim-revenue-created-at",
          1: "dim-orders-created-at",
        },
      },
      targetItems: [
        {
          name: "Time",
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
    };

    const rows = buildDimensionPickerSidebarCategorySelectRows({
      category: timeCategory,
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

  it("preserves expression token occurrence counts", () => {
    const timeCategory: DimensionPickerSidebarCategory = {
      key: "type:time",
      name: "Time",
      icon: "calendar",
      dimensionBreakoutInfo: {
        id: "time",
        type: "time",
        label: "Time",
        dimensionMapping: {
          0: "dim-first-revenue-created-at",
          1: "dim-second-revenue-created-at",
        },
      },
      targetItems: [
        {
          name: "Time",
          icon: "calendar",
          dimensionBreakoutInfo: {
            type: "time",
            label: "Time",
            dimensionMapping: {
              0: "dim-first-revenue-created-at",
              1: "dim-second-revenue-created-at",
            },
          },
        },
      ],
    };

    const rows = buildDimensionPickerSidebarCategorySelectRows({
      category: timeCategory,
      activeDimensionBreakout: {
        id: "time",
        type: "time",
        label: "Time",
        display: "line",
        dimensionMapping: {
          0: "dim-first-revenue-created-at",
          1: "dim-second-revenue-created-at",
        },
        projectionConfig: {},
      },
      metricSlots: [
        {
          slotIndex: 0,
          entityIndex: 0,
          sourceId: REVENUE_SOURCE_ID,
          tokenPosition: 0,
          occurrenceCount: 1,
        },
        {
          slotIndex: 1,
          entityIndex: 0,
          sourceId: REVENUE_SOURCE_ID,
          tokenPosition: 2,
          occurrenceCount: 2,
        },
      ],
      sourceDataById: {
        [REVENUE_SOURCE_ID]: { type: "metric", name: "Revenue" },
      },
      sourceColors: { 0: ["#509ee3"] },
    });

    expect(rows.map((row) => row.occurrenceCount)).toEqual([1, 2]);
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
