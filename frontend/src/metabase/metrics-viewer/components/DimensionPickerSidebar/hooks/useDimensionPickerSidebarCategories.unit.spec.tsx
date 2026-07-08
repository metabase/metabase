import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import { MetricsViewerProvider } from "metabase/metrics-viewer/context";
import { createMockMetricsViewerResult } from "metabase/metrics-viewer/test-utils";
import type {
  AvailableDimension,
  AvailableDimensionsResult,
  MetricSourceId,
  SourceDisplayInfo,
} from "metabase/metrics-viewer/types";
import type { MetricSlot } from "metabase/metrics-viewer/utils/metric-slots";

import { useDimensionPickerSidebarCategories } from "./useDimensionPickerSidebarCategories";

const REVENUE_SOURCE_ID: MetricSourceId = "metric:1";
const ORDERS_SOURCE_ID: MetricSourceId = "metric:3";

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
    canListValues: true,
    isPreferred: undefined,
    dimensionBreakoutInfo: {
      type: "boolean",
      label: "Is Active",
      dimensionMapping: { 0: "dim-is-active" },
    },
  },
];

function setup({
  availableDimensions,
  sourceOrder,
  sourceDataById,
  metricSlots = [],
}: {
  availableDimensions: AvailableDimensionsResult;
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
  metricSlots?: MetricSlot[];
}) {
  return renderHook(() => useDimensionPickerSidebarCategories(), {
    wrapper({ children }: { children: ReactNode }) {
      return (
        <MetricsViewerProvider
          value={createMockMetricsViewerResult({
            sidebarAvailableDimensions: availableDimensions,
            sourceOrder,
            sourceDataById,
            metricSlots,
          })}
        >
          {children}
        </MetricsViewerProvider>
      );
    },
  });
}

describe("useDimensionPickerSidebarCategories", () => {
  it("uses a canonical time row instead of raw time fields", () => {
    const { result } = setup({
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

    expect(result.current.map((category) => category.name)).toEqual([
      "Time",
      "Category",
      "Is Active",
    ]);
    expect(result.current.find((category) => category.name === "Time")).toEqual(
      expect.objectContaining({
        dimensionBreakoutInfo: expect.objectContaining({
          id: "time",
          type: "time",
          label: "Time",
          dimensionMapping: { 0: "dim-created-at" },
        }),
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
    const { result } = setup({
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

    expect(result.current.map((category) => category.name)).toEqual([
      "Category",
    ]);
  });

  it("groups time fields across tables when every metric slot has one", () => {
    const { result } = setup({
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

    expect(result.current).toEqual([
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

  it("prefers default dimensions when building grouped time categories", () => {
    const { result } = setup({
      availableDimensions: {
        shared: [],
        bySource: {
          [REVENUE_SOURCE_ID]: [
            {
              icon: "calendar",
              isPreferred: false,
              dimensionBreakoutInfo: {
                type: "time",
                label: "Updated At",
                dimensionMapping: { 0: "dim-updated-at" },
              },
            },
            {
              icon: "calendar",
              isPreferred: true,
              dimensionBreakoutInfo: {
                type: "time",
                label: "Created At",
                dimensionMapping: { 0: "dim-created-at" },
              },
            },
          ],
        },
      },
      sourceOrder: [REVENUE_SOURCE_ID],
      sourceDataById: {
        [REVENUE_SOURCE_ID]: { type: "metric", name: "Revenue" },
      },
      metricSlots: [
        { slotIndex: 0, entityIndex: 0, sourceId: REVENUE_SOURCE_ID },
      ],
    });

    expect(result.current.find((category) => category.name === "Time")).toEqual(
      expect.objectContaining({
        dimensionBreakoutInfo: expect.objectContaining({
          id: "time",
          dimensionMapping: { 0: "dim-created-at" },
        }),
      }),
    );
  });

  it("groups country fields across tables when every metric slot has one", () => {
    const { result } = setup({
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

    expect(result.current).toEqual([
      expect.objectContaining({
        name: "Country",
        targetItems: [
          expect.objectContaining({ name: "Product Country" }),
          expect.objectContaining({ name: "User Country" }),
        ],
        dimensionBreakoutInfo: expect.objectContaining({
          id: "geo",
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
    const { result } = setup({
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

    expect(result.current).toEqual([]);
  });

  it("shows exact same table and column category fields across all metrics", () => {
    const { result } = setup({
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

    expect(result.current).toEqual([
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
    const { result } = setup({
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

    expect(result.current).toEqual([]);
  });
});
