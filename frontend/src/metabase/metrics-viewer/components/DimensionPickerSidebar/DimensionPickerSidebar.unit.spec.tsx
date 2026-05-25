import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type {
  MetricSourceId,
  MetricsViewerTabState,
} from "metabase/metrics-viewer/types";
import type {
  AvailableDimensionsResult,
  SourceDisplayInfo,
} from "metabase/metrics-viewer/utils";
import type { MetricSlot } from "metabase/metrics-viewer/utils/metric-slots";

import { DimensionPickerSidebar } from "./DimensionPickerSidebar";
import { DimensionPickerSidebarProvider } from "./DimensionPickerSidebarContext";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

const SOURCE_ID: MetricSourceId = "metric:1";
const SECOND_SOURCE_ID: MetricSourceId = "metric:2";

const activeTab: MetricsViewerTabState = {
  id: "tab-category",
  type: "category",
  label: "Category",
  display: "bar",
  dimensionMapping: { 0: "dim-category" },
  projectionConfig: {},
};

const timeTab: MetricsViewerTabState = {
  id: "dim-created-at",
  type: "time",
  label: "Created At",
  display: "line",
  dimensionMapping: { 0: "dim-created-at" },
  projectionConfig: {},
};

const availableDimensions: AvailableDimensionsResult = {
  shared: [],
  bySource: {
    [SOURCE_ID]: [
      {
        icon: "label",
        tabInfo: {
          type: "category",
          label: "Category",
          dimensionMapping: { 0: "dim-category" },
        },
      },
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
  },
};

const sourceDataById: Record<MetricSourceId, SourceDisplayInfo> = {
  [SOURCE_ID]: { type: "metric", name: "Revenue" },
};

function setup({
  tab = activeTab,
  dimensions = availableDimensions,
  slots = [{ slotIndex: 0, entityIndex: 0, sourceId: SOURCE_ID }],
  sourceOrder = [SOURCE_ID],
  sources = sourceDataById,
}: {
  tab?: MetricsViewerTabState;
  dimensions?: AvailableDimensionsResult;
  slots?: MetricSlot[];
  sourceOrder?: MetricSourceId[];
  sources?: Record<MetricSourceId, SourceDisplayInfo>;
} = {}) {
  const onAddTab = jest.fn();
  const onUpdateActiveTab = jest.fn();

  renderWithProviders(
    <DimensionPickerSidebarProvider>
      <DimensionPickerSidebar
        activeTab={tab}
        availableDimensions={dimensions}
        metricSlots={slots}
        sourceColors={{ 0: ["#509ee3"], 1: ["#f9d45c"] }}
        metricSourceOrder={sourceOrder}
        metricSourceDataById={sources}
        onAddTab={onAddTab}
        onUpdateActiveTab={onUpdateActiveTab}
      />
    </DimensionPickerSidebarProvider>,
  );

  return { onAddTab, onUpdateActiveTab };
}

describe("DimensionPickerSidebar", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("renders the active dimension as selected", () => {
    setup();

    expect(screen.getByText("Group by")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search fields")).toBeInTheDocument();
    expect(screen.getByLabelText("Search fields")).toBeInTheDocument();
    expect(screen.queryByText("Totals")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Category" })).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(
      screen.queryByRole("button", { name: "Created At" }),
    ).not.toBeInTheDocument();
  });

  it("does not select a swapped multi-metric dimension mapping", async () => {
    setup({
      tab: {
        id: "tab-time",
        type: "time",
        label: "Time",
        display: "line",
        dimensionMapping: { 0: "dim-created-at", 1: "dim-order-date" },
        projectionConfig: {},
      },
      dimensions: {
        shared: [],
        bySource: {
          [SOURCE_ID]: [
            {
              icon: "calendar",
              tabInfo: {
                type: "time",
                label: "Swapped dates",
                dimensionMapping: { 0: "dim-order-date", 1: "dim-created-at" },
              },
            },
          ],
        },
      },
      slots: [
        { slotIndex: 0, entityIndex: 0, sourceId: SOURCE_ID },
        { slotIndex: 1, entityIndex: 1, sourceId: SOURCE_ID },
      ],
    });

    await userEvent.click(screen.getByRole("button", { name: "See all" }));

    expect(
      screen.getByRole("button", { name: "Swapped dates" }),
    ).not.toHaveAttribute("data-selected");
  });

  it("filters dimensions with search", async () => {
    setup();

    await userEvent.type(
      screen.getByPlaceholderText("Search fields"),
      "created",
    );

    expect(
      screen.getByRole("button", { name: "Created At" }),
    ).toBeInTheDocument();
    expect(screen.getByText("All fields")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Category" }),
    ).not.toBeInTheDocument();
  });

  it("shows all fields from the default view", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "See all" }));

    expect(screen.getByText("All fields")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Created At" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Revenue" }),
    ).not.toBeInTheDocument();
  });

  it("updates the active time tab with the clicked time field from all fields", async () => {
    const { onAddTab, onUpdateActiveTab } = setup({ tab: timeTab });

    await userEvent.click(screen.getByRole("button", { name: "See all" }));
    await userEvent.click(screen.getByRole("button", { name: "Order Date" }));

    expect(onAddTab).not.toHaveBeenCalled();
    expect(onUpdateActiveTab).toHaveBeenCalledWith({
      label: "Order Date",
      dimensionMapping: { 0: "dim-order-date" },
    });
  });

  it("groups all fields by metric when multiple metrics are selected", async () => {
    setup({
      dimensions: {
        shared: [
          {
            icon: "string",
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
        ],
        bySource: {
          [SOURCE_ID]: [
            {
              icon: "calendar",
              group: {
                id: "subscriptions",
                type: "main",
                displayName: "Subscriptions",
              },
              tabInfo: {
                type: "time",
                label: "Placed At",
                dimensionMapping: { 0: "dim-placed-at" },
              },
            },
          ],
          [SECOND_SOURCE_ID]: [
            {
              icon: "label",
              group: { id: "orders", type: "main", displayName: "Orders" },
              tabInfo: {
                type: "category",
                label: "Order Status",
                dimensionMapping: { 1: "dim-order-status" },
              },
            },
          ],
        },
      },
      slots: [
        { slotIndex: 0, entityIndex: 0, sourceId: SOURCE_ID },
        { slotIndex: 1, entityIndex: 1, sourceId: SECOND_SOURCE_ID },
      ],
      sourceOrder: [SOURCE_ID, SECOND_SOURCE_ID],
      sources: {
        [SOURCE_ID]: { type: "metric", name: "ARR" },
        [SECOND_SOURCE_ID]: { type: "metric", name: "Total Orders" },
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "See all" }));

    expect(screen.getByRole("button", { name: "ARR" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Total Orders" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Customers")).toBeInTheDocument();
    expect(screen.getByText("Subscriptions")).toBeInTheDocument();
    expect(screen.queryByText("Shared · Customers")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Total Orders" }));

    expect(screen.getByRole("button", { name: "ARR" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Total Orders" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Order Status" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "ARR" }));

    expect(screen.getByRole("button", { name: "ARR" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      screen.getByRole("button", { name: "Total Orders" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText("Subscriptions")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Order Status" }),
    ).toBeInTheDocument();
  });

  it("shows per-metric column selects from the settings button", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Configure Time" }),
    );

    expect(screen.getByLabelText("Select dimension for Revenue")).toHaveValue(
      "Created At",
    );
    expect(
      screen.queryByRole("button", { name: "Created At" }),
    ).not.toBeInTheDocument();
  });

  it("does not show column selects when the category row is clicked", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Time" }));

    expect(
      screen.queryByLabelText("Select dimension for Revenue"),
    ).not.toBeInTheDocument();
  });

  it("closes column selects when another category row is clicked", async () => {
    setup({ tab: timeTab });

    await userEvent.click(
      screen.getByRole("button", { name: "Configure Time" }),
    );
    expect(
      screen.getByLabelText("Select dimension for Revenue"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Category" }));

    expect(
      screen.queryByLabelText("Select dimension for Revenue"),
    ).not.toBeInTheDocument();
  });

  it("adds a new dimension tab and tracks it", async () => {
    const { onAddTab } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Time" }));

    expect(onAddTab).toHaveBeenCalledWith({
      type: "time",
      label: "Time",
      dimensionMapping: { 0: "dim-created-at" },
    });
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "metrics_viewer_dimension_tab_added",
    });
  });

  it("does not add or track the already-selected dimension", async () => {
    const { onAddTab } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Category" }));

    expect(onAddTab).not.toHaveBeenCalled();
    expect(trackSimpleEvent).not.toHaveBeenCalled();
  });

  it("updates the active tab mapping from a metric column select", async () => {
    const { onAddTab, onUpdateActiveTab } = setup({ tab: timeTab });

    await userEvent.click(
      screen.getByRole("button", { name: "Configure Time" }),
    );
    await userEvent.click(
      screen.getByLabelText("Select dimension for Revenue"),
    );
    await userEvent.click(screen.getByRole("option", { name: /Order Date/ }));

    expect(onUpdateActiveTab).toHaveBeenCalledWith({
      dimensionMapping: { 0: "dim-order-date" },
    });
    expect(onAddTab).not.toHaveBeenCalled();
    expect(trackSimpleEvent).not.toHaveBeenCalled();
    expect(screen.getByText("Group by")).toBeInTheDocument();
  });
});
