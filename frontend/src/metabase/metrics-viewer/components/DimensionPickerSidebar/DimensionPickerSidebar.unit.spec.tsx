import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import { MetricsViewerProvider } from "metabase/metrics-viewer/context";
import { createMockMetricsViewerResult } from "metabase/metrics-viewer/test-utils";
import type {
  MetricSourceId,
  MetricsViewerDimensionBreakoutState,
} from "metabase/metrics-viewer/types";
import type {
  AvailableDimensionsResult,
  SourceDisplayInfo,
} from "metabase/metrics-viewer/utils";
import type { MetricSlot } from "metabase/metrics-viewer/utils/metric-slots";

import { DimensionPickerSidebar } from "./DimensionPickerSidebar";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

const SOURCE_ID: MetricSourceId = "metric:1";
const SECOND_SOURCE_ID: MetricSourceId = "metric:2";

const activeDimensionBreakout: MetricsViewerDimensionBreakoutState = {
  id: "dimensionBreakout-category",
  type: "category",
  label: "Category",
  display: "bar",
  dimensionMapping: { 0: "dim-category" },
  projectionConfig: {},
};

const timeDimensionBreakout: MetricsViewerDimensionBreakoutState = {
  id: "dim-created-at",
  type: "time",
  label: "Created At",
  display: "line",
  dimensionMapping: { 0: "dim-created-at" },
  projectionConfig: {},
};

const scalarDimensionBreakout: MetricsViewerDimensionBreakoutState = {
  id: "scalar",
  type: "scalar",
  label: "Totals",
  display: "scalar",
  dimensionMapping: {},
  projectionConfig: {},
};

const availableDimensions: AvailableDimensionsResult = {
  shared: [],
  bySource: {
    [SOURCE_ID]: [
      {
        icon: "label",
        dimensionBreakoutInfo: {
          type: "category",
          label: "Category",
          dimensionMapping: { 0: "dim-category" },
        },
      },
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
  },
};

const sourceDataById: Record<MetricSourceId, SourceDisplayInfo> = {
  [SOURCE_ID]: { type: "metric", name: "Revenue" },
};

function setup({
  dimensionBreakout = activeDimensionBreakout,
  dimensions = availableDimensions,
  slots = [{ slotIndex: 0, entityIndex: 0, sourceId: SOURCE_ID }],
  sourceOrder = [SOURCE_ID],
  sources = sourceDataById,
}: {
  dimensionBreakout?: MetricsViewerDimensionBreakoutState;
  dimensions?: AvailableDimensionsResult;
  slots?: MetricSlot[];
  sourceOrder?: MetricSourceId[];
  sources?: Record<MetricSourceId, SourceDisplayInfo>;
} = {}) {
  const onSelectDimensionBreakout = jest.fn();
  const onUpdateActiveDimensionBreakout = jest.fn();

  const metricsViewerResult = createMockMetricsViewerResult({
    activeDimensionBreakout: dimensionBreakout,
    sidebarAvailableDimensions: dimensions,
    metricSlots: slots,
    sourceColors: { 0: ["#509ee3"], 1: ["#f9d45c"] },
    sourceOrder,
    sourceDataById: sources,
    selectDimensionBreakout: onSelectDimensionBreakout,
    updateActiveDimensionBreakout: onUpdateActiveDimensionBreakout,
  });

  renderWithProviders(
    <MetricsViewerProvider value={metricsViewerResult}>
      <DimensionPickerSidebar activeDimensionBreakout={dimensionBreakout} />
    </MetricsViewerProvider>,
  );

  return { onSelectDimensionBreakout, onUpdateActiveDimensionBreakout };
}

describe("DimensionPickerSidebar", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("renders the active dimension as selected", () => {
    setup();

    expect(screen.getByText("Break out")).toBeInTheDocument();
    expect(screen.getByText("Dimensions")).toBeInTheDocument();
    expect(screen.queryByText("Shared dimensions")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search fields")).toBeInTheDocument();
    expect(screen.getByLabelText("Search fields")).toBeInTheDocument();
    expect(screen.queryByText("Totals")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Category" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.queryByRole("button", { name: "Created At" }),
    ).not.toBeInTheDocument();
  });

  it("does not select a swapped multi-metric dimension mapping", async () => {
    setup({
      dimensionBreakout: {
        id: "dimensionBreakout-time",
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
              dimensionBreakoutInfo: {
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
    ).not.toHaveAttribute("aria-pressed", "true");
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

  it("selects no breakout and tracks it", async () => {
    const { onSelectDimensionBreakout, onUpdateActiveDimensionBreakout } =
      setup();

    await userEvent.click(screen.getByRole("button", { name: "No breakout" }));

    expect(onSelectDimensionBreakout).toHaveBeenCalledWith({
      type: "scalar",
      label: "Totals",
      dimensionMapping: {},
    });
    expect(onUpdateActiveDimensionBreakout).not.toHaveBeenCalled();
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "metrics_viewer_dimension_selected",
    });
  });

  it("marks no breakout as selected", () => {
    setup({ dimensionBreakout: scalarDimensionBreakout });

    expect(screen.getByRole("button", { name: "No breakout" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("hides categories that are not available for multiple metric sources", () => {
    setup({
      dimensions: {
        shared: [
          {
            icon: "location",
            dimensionBreakoutInfo: {
              type: "geo",
              label: "Country",
              dimensionMapping: {
                0: "dim-country",
                1: "second-dim-country",
              },
            },
          },
        ],
        bySource: {
          [SOURCE_ID]: [
            {
              icon: "location",
              dimensionBreakoutInfo: {
                type: "geo",
                label: "Billing Address Country",
                dimensionMapping: { 0: "dim-billing-address-country" },
              },
            },
          ],
          [SECOND_SOURCE_ID]: [],
        },
      },
      slots: [
        { slotIndex: 0, entityIndex: 0, sourceId: SOURCE_ID },
        { slotIndex: 1, entityIndex: 1, sourceId: SECOND_SOURCE_ID },
      ],
      sourceOrder: [SOURCE_ID, SECOND_SOURCE_ID],
      sources: {
        [SOURCE_ID]: { type: "metric", name: "Revenue" },
        [SECOND_SOURCE_ID]: { type: "metric", name: "Feedback, Count" },
      },
    });

    expect(screen.getByText("Shared dimensions")).toBeInTheDocument();
    expect(screen.queryByText("Dimensions")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Country" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Billing Address Country" }),
    ).not.toBeInTheDocument();
  });

  it("keeps unshared fields available from See all", async () => {
    setup({
      dimensions: {
        shared: [],
        bySource: {
          [SOURCE_ID]: [
            {
              icon: "location",
              dimensionBreakoutInfo: {
                type: "geo",
                label: "Billing Address Country",
                dimensionMapping: { 0: "dim-billing-address-country" },
              },
            },
          ],
          [SECOND_SOURCE_ID]: [],
        },
      },
      slots: [
        { slotIndex: 0, entityIndex: 0, sourceId: SOURCE_ID },
        { slotIndex: 1, entityIndex: 1, sourceId: SECOND_SOURCE_ID },
      ],
      sourceOrder: [SOURCE_ID, SECOND_SOURCE_ID],
      sources: {
        [SOURCE_ID]: { type: "metric", name: "Revenue" },
        [SECOND_SOURCE_ID]: { type: "metric", name: "Feedback, Count" },
      },
    });

    expect(screen.getByText("No shared dimensions found")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "See all" }));

    expect(screen.getByText("All fields")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Billing Address Country" }),
    ).toBeInTheDocument();
  });

  it("updates the active time dimensionBreakout with the clicked time field from all fields", async () => {
    const { onSelectDimensionBreakout, onUpdateActiveDimensionBreakout } =
      setup({ dimensionBreakout: timeDimensionBreakout });

    await userEvent.click(screen.getByRole("button", { name: "See all" }));
    await userEvent.click(screen.getByRole("button", { name: "Order Date" }));

    expect(onSelectDimensionBreakout).not.toHaveBeenCalled();
    expect(onUpdateActiveDimensionBreakout).toHaveBeenCalled();
    const updaterFn = onUpdateActiveDimensionBreakout.mock.calls[0][0];
    expect(updaterFn(timeDimensionBreakout)).toMatchObject({
      label: "Order Date",
      dimensionMapping: { 0: "dim-order-date" },
    });
  });

  it("preserves other metric mappings when selecting an aggregate field from See all", async () => {
    const { onSelectDimensionBreakout, onUpdateActiveDimensionBreakout } =
      setup({
        dimensionBreakout: {
          id: "dim-created-at",
          type: "time",
          label: "Created At",
          display: "line",
          dimensionMapping: {
            0: "dim-created-at",
            1: "second-dim-created-at",
          },
          projectionConfig: {},
        },
        dimensions: {
          shared: [
            {
              icon: "calendar",
              dimensionBreakoutInfo: {
                type: "time",
                label: "Created At",
                dimensionMapping: {
                  0: "dim-created-at",
                  1: "second-dim-created-at",
                },
              },
            },
          ],
          bySource: {
            [SOURCE_ID]: [
              {
                icon: "calendar",
                dimensionBreakoutInfo: {
                  type: "time",
                  label: "Birth Date",
                  dimensionMapping: { 0: "dim-birth-date" },
                },
              },
            ],
            [SECOND_SOURCE_ID]: [],
          },
        },
        slots: [
          { slotIndex: 0, entityIndex: 0, sourceId: SOURCE_ID },
          { slotIndex: 1, entityIndex: 1, sourceId: SECOND_SOURCE_ID },
        ],
        sourceOrder: [SOURCE_ID, SECOND_SOURCE_ID],
        sources: {
          [SOURCE_ID]: { type: "metric", name: "Revenue" },
          [SECOND_SOURCE_ID]: { type: "metric", name: "Total Orders" },
        },
      });

    await userEvent.click(screen.getByRole("button", { name: "See all" }));
    await userEvent.click(screen.getByRole("button", { name: "Birth Date" }));

    expect(onUpdateActiveDimensionBreakout).toHaveBeenCalled();
    const updaterFn = onUpdateActiveDimensionBreakout.mock.calls[0][0];
    expect(
      updaterFn({
        id: "dim-created-at",
        type: "time",
        label: "Created At",
        display: "line",
        dimensionMapping: {
          0: "dim-created-at",
          1: "second-dim-created-at",
        },
        projectionConfig: {},
      }),
    ).toMatchObject({
      label: "Birth Date",
      dimensionMapping: {
        0: "dim-birth-date",
        1: "second-dim-created-at",
      },
    });
    expect(onSelectDimensionBreakout).not.toHaveBeenCalled();
  });

  it("activates the clicked field when its slot is already mapped", async () => {
    const { onSelectDimensionBreakout, onUpdateActiveDimensionBreakout } =
      setup({
        dimensionBreakout: {
          id: "second-dim-created-at",
          type: "time",
          label: "Created At",
          display: "line",
          dimensionMapping: {
            0: "dim-birth-date",
            1: "second-dim-created-at",
          },
          projectionConfig: {},
        },
        dimensions: {
          shared: [],
          bySource: {
            [SOURCE_ID]: [
              {
                icon: "calendar",
                dimensionBreakoutInfo: {
                  type: "time",
                  label: "Birth Date",
                  dimensionMapping: { 0: "dim-birth-date" },
                },
              },
            ],
            [SECOND_SOURCE_ID]: [
              {
                icon: "calendar",
                dimensionBreakoutInfo: {
                  type: "time",
                  label: "Created At",
                  dimensionMapping: { 1: "second-dim-created-at" },
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
          [SOURCE_ID]: { type: "metric", name: "Revenue" },
          [SECOND_SOURCE_ID]: { type: "metric", name: "Total Orders" },
        },
      });

    await userEvent.click(screen.getByRole("button", { name: "See all" }));
    await userEvent.click(screen.getByRole("button", { name: "Birth Date" }));

    expect(onUpdateActiveDimensionBreakout).toHaveBeenCalled();
    const updaterFn = onUpdateActiveDimensionBreakout.mock.calls[0][0];
    expect(
      updaterFn({
        id: "second-dim-created-at",
        type: "time",
        label: "Created At",
        display: "line",
        dimensionMapping: {
          0: "dim-birth-date",
          1: "second-dim-created-at",
        },
        projectionConfig: {},
      }),
    ).toMatchObject({
      label: "Birth Date",
      dimensionMapping: {
        0: "dim-birth-date",
        1: "second-dim-created-at",
      },
    });
    expect(onSelectDimensionBreakout).not.toHaveBeenCalled();
  });

  it("selects only the clicked non-comparable field from See all", async () => {
    const { onSelectDimensionBreakout, onUpdateActiveDimensionBreakout } =
      setup({
        dimensionBreakout: {
          id: "dim-status",
          type: "category",
          label: "Status",
          display: "bar",
          dimensionMapping: {
            0: "dim-user-category",
            1: "dim-product-status",
          },
          projectionConfig: {},
        },
        dimensions: {
          shared: [],
          bySource: {
            [SOURCE_ID]: [
              {
                icon: "label",
                group: { id: "users", type: "main", displayName: "Users" },
                dimensionBreakoutInfo: {
                  type: "category",
                  label: "Status",
                  dimensionMapping: { 0: "dim-user-status" },
                },
              },
            ],
            [SECOND_SOURCE_ID]: [
              {
                icon: "label",
                group: {
                  id: "products",
                  type: "main",
                  displayName: "Products",
                },
                dimensionBreakoutInfo: {
                  type: "category",
                  label: "Status",
                  dimensionMapping: { 1: "dim-product-status" },
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
          [SOURCE_ID]: { type: "metric", name: "Revenue" },
          [SECOND_SOURCE_ID]: { type: "metric", name: "Total Orders" },
        },
      });

    await userEvent.click(screen.getByRole("button", { name: "See all" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Status" })[0]);

    expect(onSelectDimensionBreakout).toHaveBeenCalledWith({
      id: "dim-user-status",
      type: "category",
      label: "Status",
      dimensionMapping: { 0: "dim-user-status", 1: null },
    });
    expect(onUpdateActiveDimensionBreakout).not.toHaveBeenCalled();
  });

  it.each([
    ["Address", "dim-revenue-user-address"],
    ["Name", "dim-revenue-user-name"],
  ])(
    "does not keep Accounts Email selected when selecting Revenue User %s",
    async (fieldName, fieldId) => {
      const { onSelectDimensionBreakout, onUpdateActiveDimensionBreakout } =
        setup({
          dimensionBreakout: {
            id: "dim-accounts-email",
            type: "category",
            label: "Email",
            display: "bar",
            dimensionMapping: { 1: "dim-accounts-email" },
            projectionConfig: {},
          },
          dimensions: {
            shared: [],
            bySource: {
              [SOURCE_ID]: [
                {
                  icon: "label",
                  group: { id: "users", type: "main", displayName: "User" },
                  dimensionBreakoutInfo: {
                    type: "category",
                    label: fieldName,
                    dimensionMapping: { 0: fieldId },
                  },
                },
              ],
              [SECOND_SOURCE_ID]: [
                {
                  icon: "label",
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
            },
          },
          slots: [
            { slotIndex: 0, entityIndex: 0, sourceId: SOURCE_ID },
            { slotIndex: 1, entityIndex: 1, sourceId: SECOND_SOURCE_ID },
          ],
          sourceOrder: [SOURCE_ID, SECOND_SOURCE_ID],
          sources: {
            [SOURCE_ID]: { type: "metric", name: "Revenue" },
            [SECOND_SOURCE_ID]: { type: "metric", name: "Accounts, Count" },
          },
        });

      await userEvent.click(screen.getByRole("button", { name: "See all" }));
      await userEvent.click(screen.getByRole("button", { name: fieldName }));

      expect(onSelectDimensionBreakout).toHaveBeenCalledWith({
        id: fieldId,
        type: "category",
        label: fieldName,
        dimensionMapping: { 0: fieldId, 1: null },
      });
      expect(onUpdateActiveDimensionBreakout).not.toHaveBeenCalled();
    },
  );

  it("marks metric-scoped See all dimensions as selected", async () => {
    setup({
      dimensionBreakout: {
        id: "dim-birth-date",
        type: "time",
        label: "Birth Date",
        display: "line",
        dimensionMapping: {
          0: "dim-birth-date",
          1: "second-dim-created-at",
        },
        projectionConfig: {},
      },
      dimensions: {
        shared: [
          {
            icon: "calendar",
            dimensionBreakoutInfo: {
              type: "time",
              label: "Created At",
              dimensionMapping: {
                0: "dim-created-at",
                1: "second-dim-created-at",
              },
            },
          },
        ],
        bySource: {
          [SOURCE_ID]: [
            {
              icon: "calendar",
              dimensionBreakoutInfo: {
                type: "time",
                label: "Birth Date",
                dimensionMapping: { 0: "dim-birth-date" },
              },
            },
          ],
          [SECOND_SOURCE_ID]: [],
        },
      },
      slots: [
        { slotIndex: 0, entityIndex: 0, sourceId: SOURCE_ID },
        { slotIndex: 1, entityIndex: 1, sourceId: SECOND_SOURCE_ID },
      ],
      sourceOrder: [SOURCE_ID, SECOND_SOURCE_ID],
      sources: {
        [SOURCE_ID]: { type: "metric", name: "Revenue" },
        [SECOND_SOURCE_ID]: { type: "metric", name: "Total Orders" },
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "See all" }));

    expect(screen.getByRole("button", { name: "Birth Date" })).toHaveAttribute(
      "data-selected",
      "true",
    );

    await userEvent.click(screen.getByRole("button", { name: "Total Orders" }));

    const createdAtButtons = screen.getAllByRole("button", {
      name: "Created At",
    });
    expect(createdAtButtons[0]).not.toHaveAttribute("data-selected");
    expect(createdAtButtons[1]).toHaveAttribute("data-selected", "true");
  });

  it("groups all fields by metric when multiple metrics are selected", async () => {
    setup({
      dimensions: {
        shared: [
          {
            icon: "string",
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
              dimensionBreakoutInfo: {
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
              dimensionBreakoutInfo: {
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

  it("expands all metric accordions while searching all fields", async () => {
    setup({
      dimensions: {
        shared: [],
        bySource: {
          [SOURCE_ID]: [
            {
              icon: "calendar",
              dimensionBreakoutInfo: {
                type: "time",
                label: "Created At",
                dimensionMapping: { 0: "dim-created-at" },
              },
            },
          ],
          [SECOND_SOURCE_ID]: [
            {
              icon: "calendar",
              dimensionBreakoutInfo: {
                type: "time",
                label: "Created At",
                dimensionMapping: { 1: "second-dim-created-at" },
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
        [SOURCE_ID]: { type: "metric", name: "Revenue" },
        [SECOND_SOURCE_ID]: { type: "metric", name: "Total Orders" },
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "See all" }));

    expect(screen.getByRole("button", { name: "Revenue" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Total Orders" }),
    ).toHaveAttribute("aria-expanded", "false");

    await userEvent.type(
      screen.getByPlaceholderText("Search fields"),
      "created",
    );

    expect(screen.getByRole("button", { name: "Revenue" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Total Orders" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("button", { name: "Created At" })).toHaveLength(
      2,
    );
  });

  it("shows one See all accordion per metric slot when the same metric is selected twice", async () => {
    setup({
      dimensions: {
        shared: [],
        bySource: {
          [SOURCE_ID]: [
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
        },
      },
      slots: [
        { slotIndex: 0, entityIndex: 0, sourceId: SOURCE_ID },
        { slotIndex: 1, entityIndex: 1, sourceId: SOURCE_ID },
      ],
      sourceOrder: [SOURCE_ID],
      sources: {
        [SOURCE_ID]: { type: "metric", name: "Revenue" },
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "See all" }));

    const revenueAccordions = screen.getAllByRole("button", {
      name: "Revenue",
    });
    expect(revenueAccordions).toHaveLength(2);
    expect(revenueAccordions[0]).toHaveAttribute("aria-expanded", "true");
    expect(revenueAccordions[1]).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(revenueAccordions[1]);

    expect(revenueAccordions[0]).toHaveAttribute("aria-expanded", "true");
    expect(revenueAccordions[1]).toHaveAttribute("aria-expanded", "true");
  });

  it("uses circle indicators for expression metric dropdown rows", async () => {
    setup({
      dimensionBreakout: timeDimensionBreakout,
      dimensions: {
        shared: [
          {
            icon: "calendar",
            dimensionBreakoutInfo: {
              type: "time",
              label: "Time",
              dimensionMapping: {
                0: "dim-revenue-created-at",
                1: "dim-feedback-created-at",
              },
            },
          },
        ],
        bySource: {},
      },
      slots: [
        {
          slotIndex: 0,
          entityIndex: 0,
          sourceId: SOURCE_ID,
          tokenPosition: 0,
        },
        {
          slotIndex: 1,
          entityIndex: 0,
          sourceId: SECOND_SOURCE_ID,
          tokenPosition: 2,
        },
      ],
      sourceOrder: [SOURCE_ID, SECOND_SOURCE_ID],
      sources: {
        [SOURCE_ID]: { type: "metric", name: "Revenue" },
        [SECOND_SOURCE_ID]: { type: "metric", name: "Feedback, Count" },
      },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Configure Time" }),
    );

    for (const indicator of screen.getAllByTestId(
      "color-indicator-container",
    )) {
      expect(
        within(indicator).queryByRole("img", { hidden: true }),
      ).not.toBeInTheDocument();
    }
  });

  it("uses circle indicators for expression metric See all accordions", async () => {
    setup({
      dimensions: {
        shared: [],
        bySource: {
          [SOURCE_ID]: [
            {
              icon: "calendar",
              dimensionBreakoutInfo: {
                type: "time",
                label: "Created At",
                dimensionMapping: { 0: "dim-revenue-created-at" },
              },
            },
          ],
          [SECOND_SOURCE_ID]: [
            {
              icon: "calendar",
              dimensionBreakoutInfo: {
                type: "time",
                label: "Created At",
                dimensionMapping: { 1: "dim-feedback-created-at" },
              },
            },
          ],
        },
      },
      slots: [
        {
          slotIndex: 0,
          entityIndex: 0,
          sourceId: SOURCE_ID,
          tokenPosition: 0,
        },
        {
          slotIndex: 1,
          entityIndex: 0,
          sourceId: SECOND_SOURCE_ID,
          tokenPosition: 2,
        },
      ],
      sourceOrder: [SOURCE_ID, SECOND_SOURCE_ID],
      sources: {
        [SOURCE_ID]: { type: "metric", name: "Revenue" },
        [SECOND_SOURCE_ID]: { type: "metric", name: "Feedback, Count" },
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "See all" }));

    expect(screen.getByRole("button", { name: "Revenue" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Feedback, Count" }),
    ).toBeInTheDocument();
    for (const indicator of screen.getAllByTestId(
      "color-indicator-container",
    )) {
      expect(
        within(indicator).queryByRole("img", { hidden: true }),
      ).not.toBeInTheDocument();
    }
  });

  it("merges shared and metric sections with the same table name", async () => {
    setup({
      dimensions: {
        shared: [
          {
            icon: "calendar",
            group: { id: "products", type: "main", displayName: "Product" },
            dimensionBreakoutInfo: {
              type: "time",
              label: "Created At",
              dimensionMapping: {
                0: "dim-product-created-at",
                1: "dim-product-created-at",
              },
            },
          },
        ],
        bySource: {
          [SOURCE_ID]: [
            {
              icon: "label",
              group: {
                id: "products",
                type: "main",
                displayName: "Product",
              },
              dimensionBreakoutInfo: {
                type: "category",
                label: "Title",
                dimensionMapping: { 0: "dim-product-title" },
              },
            },
          ],
          [SECOND_SOURCE_ID]: [],
        },
      },
      slots: [
        { slotIndex: 0, entityIndex: 0, sourceId: SOURCE_ID },
        { slotIndex: 1, entityIndex: 1, sourceId: SECOND_SOURCE_ID },
      ],
      sourceOrder: [SOURCE_ID, SECOND_SOURCE_ID],
      sources: {
        [SOURCE_ID]: { type: "metric", name: "Revenue" },
        [SECOND_SOURCE_ID]: { type: "metric", name: "Number of Orders" },
      },
    });

    await userEvent.click(screen.getByRole("button", { name: "See all" }));

    expect(screen.getAllByText("Product")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Created At" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Title" })).toBeInTheDocument();
  });

  it("shows inline column options from the settings button for one metric", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Configure Time" }),
    );

    expect(
      screen.queryByLabelText("Select dimension for Revenue"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Created At" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.getByRole("button", { name: "Order Date" }),
    ).toBeInTheDocument();
  });

  it("does not show settings or duplicate options for a category with one exact column", async () => {
    const { onSelectDimensionBreakout } = setup({
      dimensionBreakout: scalarDimensionBreakout,
      dimensions: {
        shared: [],
        bySource: {
          [SOURCE_ID]: [
            {
              icon: "location",
              dimensionBreakoutInfo: {
                type: "geo",
                label: "State",
                dimensionMapping: { 0: "dim-state" },
              },
            },
          ],
        },
      },
    });

    expect(
      screen.queryByRole("button", { name: "Configure State" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "State" })).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "State" }));

    expect(onSelectDimensionBreakout).toHaveBeenCalledWith({
      type: "geo",
      label: "State",
      dimensionMapping: { 0: "dim-state" },
    });
  });

  it("does not show settings when every metric has only one exact column", () => {
    setup({
      dimensionBreakout: {
        ...timeDimensionBreakout,
        label: "Time",
        dimensionMapping: {
          0: "dim-created-at",
          1: "dim-second-created-at",
        },
      },
      dimensions: {
        shared: [
          {
            icon: "calendar",
            dimensionBreakoutInfo: {
              type: "time",
              label: "Time",
              dimensionMapping: {
                0: "dim-created-at",
                1: "dim-second-created-at",
              },
            },
          },
        ],
        bySource: {},
      },
      slots: [
        { slotIndex: 0, entityIndex: 0, sourceId: SOURCE_ID },
        { slotIndex: 1, entityIndex: 1, sourceId: SECOND_SOURCE_ID },
      ],
      sourceOrder: [SOURCE_ID, SECOND_SOURCE_ID],
      sources: {
        [SOURCE_ID]: { type: "metric", name: "Revenue" },
        [SECOND_SOURCE_ID]: { type: "metric", name: "Feedback, Count" },
      },
    });

    expect(
      screen.queryByRole("button", { name: "Configure Time" }),
    ).not.toBeInTheDocument();
  });

  it("shows per-metric column selects from the settings button for multiple metrics", async () => {
    setup({
      dimensionBreakout: {
        ...timeDimensionBreakout,
        dimensionMapping: {
          0: "dim-created-at",
          1: "dim-second-created-at",
        },
      },
      dimensions: {
        shared: [
          {
            icon: "calendar",
            dimensionBreakoutInfo: {
              type: "time",
              label: "Time",
              dimensionMapping: {
                0: "dim-created-at",
                1: "dim-second-created-at",
              },
            },
          },
        ],
        bySource: {
          [SOURCE_ID]: [
            {
              icon: "calendar",
              dimensionBreakoutInfo: {
                type: "time",
                label: "Order Date",
                dimensionMapping: { 0: "dim-order-date" },
              },
            },
          ],
          [SECOND_SOURCE_ID]: [
            {
              icon: "calendar",
              dimensionBreakoutInfo: {
                type: "time",
                label: "Order Date",
                dimensionMapping: { 1: "dim-second-order-date" },
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
        [SOURCE_ID]: { type: "metric", name: "Revenue" },
        [SECOND_SOURCE_ID]: { type: "metric", name: "Feedback, Count" },
      },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Configure Time" }),
    );

    expect(screen.getByLabelText("Select dimension for Revenue")).toHaveValue(
      "Time",
    );
    expect(
      screen.getByLabelText("Select dimension for Feedback, Count"),
    ).toHaveValue("Time");
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("Feedback, Count")).toBeInTheDocument();
  });

  it("shows expression occurrence counts in dropdown rows and See all accordions", async () => {
    setup({
      dimensionBreakout: {
        ...timeDimensionBreakout,
        dimensionMapping: {
          0: "dim-first-revenue-created-at",
          1: "dim-second-revenue-created-at",
        },
      },
      dimensions: {
        shared: [],
        bySource: {
          [SOURCE_ID]: [
            {
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
        },
      },
      slots: [
        {
          slotIndex: 0,
          entityIndex: 0,
          sourceId: SOURCE_ID,
          tokenPosition: 0,
          occurrenceCount: 1,
        },
        {
          slotIndex: 1,
          entityIndex: 0,
          sourceId: SOURCE_ID,
          tokenPosition: 2,
          occurrenceCount: 2,
        },
      ],
      sourceOrder: [SOURCE_ID],
      sources: {
        [SOURCE_ID]: { type: "metric", name: "Revenue" },
      },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Configure Time" }),
    );

    expect(screen.getByText("2")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "See all" }));

    expect(screen.getAllByText("Revenue")).toHaveLength(2);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("uses the active time mapping for column select values", async () => {
    setup({
      dimensionBreakout: {
        ...timeDimensionBreakout,
        dimensionMapping: { 0: "dim-created-at" },
      },
      dimensions: {
        shared: [],
        bySource: {
          [SOURCE_ID]: [
            {
              icon: "calendar",
              dimensionBreakoutInfo: {
                type: "time",
                label: "Birth Date",
                dimensionMapping: { 0: "dim-birth-date" },
              },
            },
            {
              icon: "calendar",
              dimensionBreakoutInfo: {
                type: "time",
                label: "Created At",
                dimensionMapping: { 0: "dim-created-at" },
              },
            },
          ],
        },
      },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Configure Time" }),
    );

    expect(screen.getByRole("button", { name: "Created At" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("does not mark category column options as selected when no breakout is active", async () => {
    setup({ dimensionBreakout: scalarDimensionBreakout });

    await userEvent.click(
      screen.getByRole("button", { name: "Configure Time" }),
    );

    expect(screen.getByRole("button", { name: "Created At" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Order Date" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("does not mark category column options as selected when another category is active", async () => {
    setup({
      dimensionBreakout: {
        id: "dim-name",
        type: "category",
        label: "Name",
        display: "bar",
        dimensionMapping: { 0: "dim-name" },
        projectionConfig: {},
      },
      dimensions: {
        shared: [],
        bySource: {
          [SOURCE_ID]: [
            ...availableDimensions.bySource[SOURCE_ID],
            {
              icon: "label",
              dimensionBreakoutInfo: {
                type: "category",
                label: "Name",
                dimensionMapping: { 0: "dim-name" },
              },
            },
          ],
        },
      },
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Configure Time" }),
    );

    expect(screen.getByRole("button", { name: "Created At" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Order Date" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("selects the clicked inactive aggregate column option", async () => {
    const { onSelectDimensionBreakout, onUpdateActiveDimensionBreakout } =
      setup({
        dimensionBreakout: {
          id: "dim-name",
          type: "category",
          label: "Name",
          display: "bar",
          dimensionMapping: { 0: "dim-name" },
          projectionConfig: {},
        },
        dimensions: {
          shared: [],
          bySource: {
            [SOURCE_ID]: [
              ...availableDimensions.bySource[SOURCE_ID],
              {
                icon: "label",
                dimensionBreakoutInfo: {
                  type: "category",
                  label: "Name",
                  dimensionMapping: { 0: "dim-name" },
                },
              },
            ],
          },
        },
      });

    await userEvent.click(
      screen.getByRole("button", { name: "Configure Time" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Order Date" }));

    expect(onSelectDimensionBreakout).toHaveBeenCalledWith(
      {
        id: "time",
        type: "time",
        label: "Time",
        dimensionMapping: { 0: "dim-order-date" },
      },
      { updateExisting: true },
    );
    expect(onUpdateActiveDimensionBreakout).not.toHaveBeenCalled();
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "metrics_viewer_dimension_selected",
    });
  });

  it("does not show column selects when the category row is clicked", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Time" }));

    expect(
      screen.queryByLabelText("Select dimension for Revenue"),
    ).not.toBeInTheDocument();
  });

  it("closes column selects when another category row is clicked", async () => {
    setup({ dimensionBreakout: timeDimensionBreakout });

    await userEvent.click(
      screen.getByRole("button", { name: "Configure Time" }),
    );
    expect(
      screen.getByRole("button", { name: "Created At" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Category" }));

    expect(
      screen.queryByRole("button", { name: "Created At" }),
    ).not.toBeInTheDocument();
  });

  it("selects a new dimension breakout and tracks it", async () => {
    const { onSelectDimensionBreakout } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Time" }));

    expect(onSelectDimensionBreakout).toHaveBeenCalledWith({
      id: "time",
      type: "time",
      label: "Time",
      dimensionMapping: { 0: "dim-created-at" },
    });
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "metrics_viewer_dimension_selected",
    });
  });

  it("does not add or track the already-selected dimension", async () => {
    const { onSelectDimensionBreakout } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Category" }));

    expect(onSelectDimensionBreakout).not.toHaveBeenCalled();
    expect(trackSimpleEvent).not.toHaveBeenCalled();
  });

  it("updates the active dimensionBreakout mapping from a single metric column option", async () => {
    const { onSelectDimensionBreakout, onUpdateActiveDimensionBreakout } =
      setup({ dimensionBreakout: timeDimensionBreakout });

    await userEvent.click(
      screen.getByRole("button", { name: "Configure Time" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Order Date" }));

    expect(onUpdateActiveDimensionBreakout).toHaveBeenCalled();
    const updaterFn = onUpdateActiveDimensionBreakout.mock.calls[0][0];
    expect(updaterFn(timeDimensionBreakout)).toMatchObject({
      dimensionMapping: { 0: "dim-order-date" },
    });
    expect(onSelectDimensionBreakout).not.toHaveBeenCalled();
    expect(trackSimpleEvent).not.toHaveBeenCalled();
    expect(screen.getByText("Break out")).toBeInTheDocument();
  });
});
