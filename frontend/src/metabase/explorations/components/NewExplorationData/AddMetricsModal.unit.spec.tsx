import userEvent from "@testing-library/user-event";

import { setupMetricsEndpoints } from "__support__/server-mocks/metric";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type {
  MetricDimension,
  MetricOrMeasure,
} from "metabase/explorations/types";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";

import { AddMetricsModal } from "./AddMetricsModal";

const dimRevenue = createMockMetricDimension({
  id: "dim-revenue",
  "display-name": "Customer size",
});
const dimChurn = createMockMetricDimension({
  id: "dim-churn",
  "display-name": "Plan",
});
const dimShared = createMockMetricDimension({
  id: "dim-shared",
  "display-name": "Country",
});

const metricRevenue = createMockMetric({
  id: 1,
  name: "Monthly recurring revenue",
  description: "Revenue per month",
  dimensions: [dimRevenue, dimShared],
});
const metricChurn = createMockMetric({
  id: 2,
  name: "Churn rate",
  description: "Customers lost",
  dimensions: [dimChurn, dimShared],
});

const revenueAsMetric: MetricOrMeasure = {
  type: "metric",
  id: metricRevenue.id,
  name: metricRevenue.name,
  description: metricRevenue.description,
  dimensions: metricRevenue.dimensions,
};
const churnAsMetric: MetricOrMeasure = {
  type: "metric",
  id: metricChurn.id,
  name: metricChurn.name,
  description: metricChurn.description,
  dimensions: metricChurn.dimensions,
};

interface SetupOpts {
  initialMetrics?: MetricOrMeasure[];
  initialDimensions?: MetricDimension[];
}

function setup({
  initialMetrics = [],
  initialDimensions = [],
}: SetupOpts = {}) {
  setupMetricsEndpoints([metricRevenue, metricChurn]);

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
      expect.objectContaining({ id: metricRevenue.id, type: "metric" }),
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
      .calls[0] as [MetricOrMeasure[], MetricDimension[]];
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
      .calls[0] as [MetricOrMeasure[], MetricDimension[]];
    expect(nextDimensions).toEqual([
      expect.objectContaining({ id: dimShared.id }),
    ]);
    expect(nextMetrics.map((m) => m.id).sort()).toEqual(
      [metricRevenue.id, metricChurn.id].sort(),
    );
  });

  it("Done commits a deselected dimension and only orphaned metrics", async () => {
    const { onSelectedItemsChange } = setup({
      initialMetrics: [revenueAsMetric, churnAsMetric],
      initialDimensions: [dimShared],
    });

    await screen.findByText("Country");
    await userEvent.click(screen.getByText("Country"));
    await clickDone();

    expect(onSelectedItemsChange).toHaveBeenCalledTimes(1);
    expect(onSelectedItemsChange.mock.calls[0]).toEqual([[], []]);
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

    await waitFor(() => {
      expect(
        screen.queryByText("Monthly recurring revenue"),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText("Churn rate")).toBeInTheDocument();

    expect(screen.queryByText("Customer size")).not.toBeInTheDocument();
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Country")).toBeInTheDocument();
  });

  it("invokes onClose when Done is clicked", async () => {
    const { onClose } = setup();

    await screen.findByText("Monthly recurring revenue");
    await clickDone();

    expect(onClose).toHaveBeenCalledTimes(1);
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
});
