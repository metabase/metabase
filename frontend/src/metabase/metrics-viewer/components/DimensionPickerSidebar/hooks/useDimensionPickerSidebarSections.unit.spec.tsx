import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

import { MetricsViewerProvider } from "metabase/metrics-viewer/context";
import { createMockMetricsViewerResult } from "metabase/metrics-viewer/test-utils";
import type {
  AvailableDimensionsResult,
  MetricSourceId,
  SourceDisplayInfo,
} from "metabase/metrics-viewer/types";

import { useDimensionPickerSidebarSections } from "./useDimensionPickerSidebarSections";

const REVENUE_SOURCE_ID: MetricSourceId = "metric:1";
const ORDERS_SOURCE_ID: MetricSourceId = "metric:3";

function setup({
  availableDimensions,
  sourceOrder,
  sourceDataById,
}: {
  availableDimensions: AvailableDimensionsResult;
  sourceOrder: MetricSourceId[];
  sourceDataById: Record<MetricSourceId, SourceDisplayInfo>;
}) {
  return renderHook(() => useDimensionPickerSidebarSections(), {
    wrapper({ children }: { children: ReactNode }) {
      return (
        <MetricsViewerProvider
          value={createMockMetricsViewerResult({
            sidebarAvailableDimensions: availableDimensions,
            sourceOrder,
            sourceDataById,
          })}
        >
          {children}
        </MetricsViewerProvider>
      );
    },
  });
}

describe("useDimensionPickerSidebarSections", () => {
  it("returns a single flat section for one metric, keeping the curated order", () => {
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
                dimensionMapping: { 0: "dim-created-at" },
              },
            },
            {
              icon: "label",
              group: {
                id: "products",
                type: "connection",
                displayName: "Products",
              },
              dimensionBreakoutInfo: {
                type: "category",
                label: "Product - Category",
                dimensionMapping: { 0: "dim-category" },
              },
            },
            {
              icon: "int",
              group: { id: "orders", type: "main", displayName: "Orders" },
              dimensionBreakoutInfo: {
                type: "numeric",
                label: "Subtotal",
                dimensionMapping: { 0: "dim-subtotal" },
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

    expect(result.current).toHaveLength(1);
    expect(result.current[0].name).toBeUndefined();
    expect(result.current[0].items.map((item) => item.name)).toEqual([
      "Created At",
      "Product - Category",
      "Subtotal",
    ]);
  });

  it("returns one Shared section without splitting shared dimensions by table", () => {
    const { result } = setup({
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

    expect(result.current).toEqual([
      expect.objectContaining({ name: "Shared", isShared: true }),
    ]);
    expect(result.current[0].items.map((item) => item.name)).toEqual([
      "Customer Name",
      "Created At",
    ]);
  });

  it("returns one section per metric named after the metric", () => {
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
                dimensionMapping: { 0: "dim-created-at" },
              },
            },
            {
              icon: "label",
              group: {
                id: "products",
                type: "connection",
                displayName: "Products",
              },
              dimensionBreakoutInfo: {
                type: "category",
                label: "Product - Category",
                dimensionMapping: { 0: "dim-category" },
              },
            },
          ],
          [ORDERS_SOURCE_ID]: [
            {
              icon: "label",
              group: { id: "plans", type: "connection", displayName: "Plans" },
              dimensionBreakoutInfo: {
                type: "category",
                label: "Plan Name",
                dimensionMapping: { 1: "dim-plan-name" },
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

    expect(result.current).toEqual([
      expect.objectContaining({ name: "Revenue", sourceId: REVENUE_SOURCE_ID }),
      expect.objectContaining({ name: "Orders", sourceId: ORDERS_SOURCE_ID }),
    ]);
    expect(result.current[0].items.map((item) => item.name)).toEqual([
      "Created At",
      "Product - Category",
    ]);
  });
});
