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
  it("uses table names without a Shared prefix for grouped shared dimensions", () => {
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
      expect.objectContaining({ name: "Customers", isShared: true }),
      expect.objectContaining({ name: "Orders", isShared: true }),
    ]);
  });

  it("orders main dimension groups before related groups", () => {
    const { result } = setup({
      availableDimensions: {
        shared: [
          {
            icon: "label",
            group: { id: "users", type: "connection", displayName: "Users" },
            dimensionBreakoutInfo: {
              type: "category",
              label: "User Name",
              dimensionMapping: { 0: "dim-user-name", 1: "dim-user-name" },
            },
          },
          {
            icon: "calendar",
            group: { id: "orders", type: "main", displayName: "Orders" },
            dimensionBreakoutInfo: {
              type: "time",
              label: "Created At",
              dimensionMapping: { 0: "dim-created-at", 1: "dim-created-at" },
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

    expect(result.current.map((section) => section.name)).toEqual([
      "Orders",
      "Users",
    ]);
  });
});
