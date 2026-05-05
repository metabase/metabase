import userEvent from "@testing-library/user-event";

import { setupMetricsEndpoints } from "__support__/server-mocks/metric";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type { ExplorationMetric } from "metabase/explorations/types";
import type { MetricDimension } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";

import { AddMetricsModal } from "./AddMetricsModal";

const dimRevenue = createMockMetricDimension({
  id: "dim-revenue",
  display_name: "Customer size",
  sources: [{ type: "field", "field-id": 1 }],
  dimension_interestingness: 0.9,
});
const dimChurn = createMockMetricDimension({
  id: "dim-churn",
  display_name: "Plan",
  sources: [{ type: "field", "field-id": 2 }],
  dimension_interestingness: 0.9,
});
const dimShared = createMockMetricDimension({
  id: "dim-shared",
  display_name: "Country",
  sources: [{ type: "field", "field-id": 3 }],
  dimension_interestingness: 0.9,
});
const dimLibrary = createMockMetricDimension({
  id: "dim-library",
  display_name: "Tier",
  sources: [{ type: "field", "field-id": 4 }],
  dimension_interestingness: 0.9,
});
const dimBoring = createMockMetricDimension({
  id: "dim-boring",
  display_name: "Color",
  sources: [{ type: "field", "field-id": 5 }],
  dimension_interestingness: 0.2,
});

const metricRevenue = createMockMetric({
  id: 1,
  name: "Monthly recurring revenue",
  description: "Revenue per month",
  dimension_ids: [dimRevenue.id, dimShared.id],
  dimensions: [dimRevenue, dimShared],
});
const metricChurn = createMockMetric({
  id: 2,
  name: "Churn rate",
  description: "Customers lost",
  dimension_ids: [dimChurn.id, dimShared.id],
  dimensions: [dimChurn, dimShared],
});
const metricLibrary = createMockMetric({
  id: 3,
  name: "Active users",
  description: "Daily active users",
  dimension_ids: [dimLibrary.id],
  dimensions: [dimLibrary],
  collection: createMockCollection({ type: "library-metrics" }),
});

const revenueAsMetric = metricRevenue as ExplorationMetric;
const churnAsMetric = metricChurn as ExplorationMetric;

interface SetupOpts {
  initialMetrics?: ExplorationMetric[];
  initialDimensions?: MetricDimension[];
  extraMetrics?: ExplorationMetric[];
}

function setup({
  initialMetrics = [],
  initialDimensions = [],
  extraMetrics = [],
}: SetupOpts = {}) {
  setupMetricsEndpoints([
    metricRevenue,
    metricChurn,
    metricLibrary,
    ...extraMetrics,
  ]);

  const onSelectedItemsChange = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <AddMetricsModal
      opened
      onClose={onClose}
      selectedMetrics={initialMetrics}
      selectedDimensions={initialDimensions}
      onSelectedItemsChange={onSelectedItemsChange}
    />,
  );

  return { onSelectedItemsChange, onClose };
}

async function clickDone() {
  await userEvent.click(screen.getByRole("button", { name: "Done" }));
}

describe("AddMetricsModal", () => {
  beforeAll(() => {
    mockGetBoundingClientRect({ height: 600, width: 600 });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("renders metrics and the union of their dimensions", async () => {
    setup();

    expect(
      await screen.findByText("Monthly recurring revenue"),
    ).toBeInTheDocument();
    expect(screen.getByText("Churn rate")).toBeInTheDocument();

    expect(screen.getByText("Customer size")).toBeInTheDocument();
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Country")).toBeInTheDocument();
  });

  it("toggles do not call onSelectedItemsChange until Done is clicked", async () => {
    const { onSelectedItemsChange } = setup();

    const checkbox = await screen.findByRole("checkbox", {
      name: "Monthly recurring revenue",
    });
    await userEvent.click(checkbox);
    await userEvent.click(screen.getByText("Plan"));

    expect(onSelectedItemsChange).not.toHaveBeenCalled();
  });

  it("Done commits checked metric and its dimensions", async () => {
    const { onSelectedItemsChange, onClose } = setup();

    const checkbox = await screen.findByRole("checkbox", {
      name: "Monthly recurring revenue",
    });
    await userEvent.click(checkbox);
    await clickDone();

    expect(onSelectedItemsChange).toHaveBeenCalledTimes(1);
    const [nextMetrics, nextDimensions] = onSelectedItemsChange.mock.calls[0];
    expect(nextMetrics).toEqual([
      expect.objectContaining({ id: metricRevenue.id }),
    ]);
    expect(nextDimensions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: dimRevenue.id }),
        expect.objectContaining({ id: dimShared.id }),
      ]),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Done commits removal of an unchecked metric and dimensions no other selected metric uses", async () => {
    const { onSelectedItemsChange } = setup({
      initialMetrics: [revenueAsMetric, churnAsMetric],
      initialDimensions: [dimRevenue, dimChurn, dimShared],
    });

    const checkbox = await screen.findByRole("checkbox", {
      name: "Monthly recurring revenue",
    });
    await userEvent.click(checkbox);
    await clickDone();

    expect(onSelectedItemsChange).toHaveBeenCalledTimes(1);
    const [nextMetrics, nextDimensions] = onSelectedItemsChange.mock
      .calls[0] as [ExplorationMetric[], MetricDimension[]];
    expect(nextMetrics).toEqual([
      expect.objectContaining({ id: metricChurn.id }),
    ]);
    expect(nextDimensions.map((d) => d.id).sort()).toEqual(
      [dimChurn.id, dimShared.id].sort(),
    );
  });

  it("Done commits the dimension click and its connected metrics", async () => {
    const { onSelectedItemsChange } = setup();

    await screen.findByText("Country");
    await userEvent.click(screen.getByText("Country"));
    await clickDone();

    expect(onSelectedItemsChange).toHaveBeenCalledTimes(1);
    const [nextMetrics, nextDimensions] = onSelectedItemsChange.mock
      .calls[0] as [ExplorationMetric[], MetricDimension[]];
    expect(nextDimensions).toEqual([
      expect.objectContaining({ id: dimShared.id }),
    ]);
    expect(nextMetrics.map((m) => m.id).sort()).toEqual(
      [metricRevenue.id, metricChurn.id].sort(),
    );
  });

  it("disables Done after deselecting the only shared dimension orphans all metrics", async () => {
    const { onSelectedItemsChange } = setup({
      initialMetrics: [revenueAsMetric, churnAsMetric],
      initialDimensions: [dimShared],
    });

    await screen.findByText("Country");
    await userEvent.click(screen.getByText("Country"));

    // Deselecting "Country" orphans both metrics, leaving the draft empty.
    // Done must be disabled in this invalid state and clicking it must be a
    // no-op.
    const doneButton = screen.getByRole("button", { name: "Done" });
    expect(doneButton).toBeDisabled();
    await userEvent.click(doneButton);
    expect(onSelectedItemsChange).not.toHaveBeenCalled();
  });

  it("Done keeps a metric whose other dimension is still selected", async () => {
    const { onSelectedItemsChange } = setup({
      initialMetrics: [revenueAsMetric, churnAsMetric],
      initialDimensions: [dimRevenue, dimShared],
    });

    await screen.findByText("Country");
    await userEvent.click(screen.getByText("Country"));
    await clickDone();

    expect(onSelectedItemsChange).toHaveBeenCalledTimes(1);
    const [nextMetrics, nextDimensions] = onSelectedItemsChange.mock.calls[0];
    expect(nextDimensions).toEqual([
      expect.objectContaining({ id: dimRevenue.id }),
    ]);
    expect(nextMetrics).toEqual([
      expect.objectContaining({ id: metricRevenue.id }),
    ]);
  });

  it("closing without Done discards in-flight edits", async () => {
    const { onSelectedItemsChange, onClose } = setup();

    const checkbox = await screen.findByRole("checkbox", {
      name: "Monthly recurring revenue",
    });
    await userEvent.click(checkbox);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onSelectedItemsChange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("filters metrics and the derived dimension list by search query", async () => {
    setup();

    await screen.findByText("Monthly recurring revenue");

    await userEvent.type(
      screen.getByPlaceholderText("Search for metrics or dimensions"),
      "churn",
    );

    await waitFor(
      () => {
        expect(screen.getByText("Churn rate")).toBeInTheDocument();
        expect(
          screen.queryByText("Monthly recurring revenue"),
        ).not.toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    expect(screen.queryByText("Customer size")).not.toBeInTheDocument();
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Country")).toBeInTheDocument();
  });

  it("invokes onClose when Done is clicked", async () => {
    const { onClose } = setup({
      initialMetrics: [revenueAsMetric],
      initialDimensions: [dimRevenue],
    });

    await screen.findByText("Monthly recurring revenue");
    await clickDone();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables Done until at least one metric and one dimension are picked", async () => {
    const { onSelectedItemsChange } = setup();

    await screen.findByText("Monthly recurring revenue");
    const doneButton = screen.getByRole("button", { name: "Done" });

    // Empty draft → disabled.
    expect(doneButton).toBeDisabled();

    // Checking a metric auto-adds its interesting dimension(s), so both
    // lists become non-empty and Done turns enabled.
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Active users" }),
    );
    expect(doneButton).toBeEnabled();

    // Unchecking the metric drops the auto-added dim too, returning the
    // draft to the empty state — Done goes back to disabled.
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Active users" }),
    );
    expect(doneButton).toBeDisabled();

    // Clicking the disabled button must not commit.
    await userEvent.click(doneButton);
    expect(onSelectedItemsChange).not.toHaveBeenCalled();
  });

  it("renders metric description alongside the name", async () => {
    setup();
    await screen.findByText("Monthly recurring revenue");
    const row = screen
      .getAllByRole("listitem")
      .find((el) =>
        within(el).queryByText("Monthly recurring revenue"),
      ) as HTMLElement;
    expect(within(row).getByText("Revenue per month")).toBeInTheDocument();
  });

  it("checking a metric only auto-picks its interesting dimensions", async () => {
    const metricMixed = createMockMetric({
      id: 99,
      name: "Mixed metric",
      description: null,
      dimension_ids: [dimRevenue.id, dimBoring.id],
      dimensions: [dimRevenue, dimBoring],
    });

    const { onSelectedItemsChange } = setup({
      extraMetrics: [metricMixed as ExplorationMetric],
    });

    const checkbox = await screen.findByRole("checkbox", {
      name: "Mixed metric",
    });
    await userEvent.click(checkbox);
    await clickDone();

    expect(onSelectedItemsChange).toHaveBeenCalledTimes(1);
    const [nextMetrics, nextDimensions] = onSelectedItemsChange.mock.calls[0];

    expect(nextMetrics).toEqual([
      expect.objectContaining({ id: metricMixed.id }),
    ]);
    // Only the high-score dim (dimRevenue, 0.9) is auto-picked. The low-score
    // dim (dimBoring, 0.2) is left out.
    expect(nextDimensions).toEqual([
      expect.objectContaining({ id: dimRevenue.id }),
    ]);
  });
});
