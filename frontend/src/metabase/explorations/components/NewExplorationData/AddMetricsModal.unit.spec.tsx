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

interface SetupOpts {
  initialMetrics?: MetricOrMeasure[];
  initialDimensions?: MetricDimension[];
}

function setup({
  initialMetrics = [],
  initialDimensions = [],
}: SetupOpts = {}) {
  setupMetricsEndpoints([metricRevenue, metricChurn]);

  const setMetrics = jest.fn();
  const setDimensions = jest.fn();
  const onClose = jest.fn();

  renderWithProviders(
    <AddMetricsModal
      opened
      onClose={onClose}
      metrics={initialMetrics}
      setMetrics={setMetrics}
      dimensions={initialDimensions}
      setDimensions={setDimensions}
    />,
  );

  return { setMetrics, setDimensions, onClose };
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

  it("checking a metric adds it and its dimensions", async () => {
    const { setMetrics, setDimensions } = setup();

    const checkbox = await screen.findByRole("checkbox", {
      name: "Monthly recurring revenue",
    });
    await userEvent.click(checkbox);

    expect(setMetrics).toHaveBeenCalledTimes(1);
    expect(setMetrics.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: metricRevenue.id, type: "metric" }),
    ]);
    expect(setDimensions).toHaveBeenCalledTimes(1);
    expect(setDimensions.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: dimRevenue.id }),
        expect.objectContaining({ id: dimShared.id }),
      ]),
    );
  });

  it("unchecking a metric removes its dimensions that no other selected metric uses", async () => {
    const initialMetrics: MetricOrMeasure[] = [
      {
        type: "metric",
        id: metricRevenue.id,
        name: metricRevenue.name,
        description: metricRevenue.description,
        dimensions: metricRevenue.dimensions,
      },
      {
        type: "metric",
        id: metricChurn.id,
        name: metricChurn.name,
        description: metricChurn.description,
        dimensions: metricChurn.dimensions,
      },
    ];
    const initialDimensions: MetricDimension[] = [
      dimRevenue,
      dimChurn,
      dimShared,
    ];
    const { setMetrics, setDimensions } = setup({
      initialMetrics,
      initialDimensions,
    });

    const checkbox = await screen.findByRole("checkbox", {
      name: "Monthly recurring revenue",
    });
    await userEvent.click(checkbox);

    expect(setMetrics).toHaveBeenCalledTimes(1);
    expect(setMetrics.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: metricChurn.id }),
    ]);
    expect(setDimensions).toHaveBeenCalledTimes(1);
    const nextDims = setDimensions.mock.calls[0][0] as MetricDimension[];
    expect(nextDims.map((d) => d.id).sort()).toEqual(
      [dimChurn.id, dimShared.id].sort(),
    );
  });

  it("clicking an unselected dimension adds that dimension and its connected metrics", async () => {
    const { setMetrics, setDimensions } = setup();

    await screen.findByText("Country");
    await userEvent.click(screen.getByText("Country"));

    expect(setDimensions).toHaveBeenCalledTimes(1);
    expect(setDimensions.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: dimShared.id }),
    ]);

    expect(setMetrics).toHaveBeenCalledTimes(1);
    const nextMetrics = setMetrics.mock.calls[0][0] as MetricOrMeasure[];
    expect(nextMetrics.map((m) => m.id).sort()).toEqual(
      [metricRevenue.id, metricChurn.id].sort(),
    );
  });

  it("clicking a selected dimension removes it and its connected metrics", async () => {
    const initialMetrics: MetricOrMeasure[] = [
      {
        type: "metric",
        id: metricRevenue.id,
        name: metricRevenue.name,
        description: metricRevenue.description,
        dimensions: metricRevenue.dimensions,
      },
      {
        type: "metric",
        id: metricChurn.id,
        name: metricChurn.name,
        description: metricChurn.description,
        dimensions: metricChurn.dimensions,
      },
    ];
    const initialDimensions: MetricDimension[] = [dimShared];
    const { setMetrics, setDimensions } = setup({
      initialMetrics,
      initialDimensions,
    });

    await screen.findByText("Country");
    await userEvent.click(screen.getByText("Country"));

    expect(setDimensions).toHaveBeenCalledTimes(1);
    expect(setDimensions.mock.calls[0][0]).toEqual([]);
    expect(setMetrics).toHaveBeenCalledTimes(1);
    expect(setMetrics.mock.calls[0][0]).toEqual([]);
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
    await userEvent.click(screen.getByRole("button", { name: "Done" }));

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
