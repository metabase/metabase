import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupExplorationDataEndpoint } from "__support__/server-mocks/metric";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import type { ExplorationBlock } from "metabase/explorations/hooks";
import {
  makeMockSelection,
  mockMetricBlock,
} from "metabase/explorations/test-utils";
import { PLUGIN_LIBRARY } from "metabase/plugins";
import type { ExplorationMetric } from "metabase-types/api";
import { createMockMetric } from "metabase-types/api/mocks/metric";

import { AddMetricsModal } from "./AddMetricsModal";

const libraryMetric: ExplorationMetric = {
  ...createMockMetric({ id: 1, name: "Revenue" }),
  dimension_ids: [],
  in_library: true,
};
const otherMetric: ExplorationMetric = {
  ...createMockMetric({ id: 2, name: "Churn" }),
  dimension_ids: [],
};

function setup({
  metrics,
  blocks = [],
}: {
  metrics: ExplorationMetric[];
  blocks?: ExplorationBlock[];
}) {
  setupExplorationDataEndpoint(metrics);
  const selection = makeMockSelection({ blocks });

  renderWithProviders(
    <AddMetricsModal opened onClose={jest.fn()} selection={selection} />,
  );
}

function libraryTab() {
  return screen.getByRole("tab", { name: /Library/ });
}

function allTab() {
  return screen.getByRole("tab", { name: "All" });
}

describe("AddMetricsModal", () => {
  // The picker list is virtualized; give the scroll container a real size so
  // rows render in jsdom.
  beforeAll(() => {
    mockGetBoundingClientRect({ height: 600, width: 600 });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    PLUGIN_LIBRARY.isEnabled = true;
  });

  afterEach(() => {
    PLUGIN_LIBRARY.isEnabled = false;
  });

  it("stays on the Library tab when the library has metrics", async () => {
    setup({ metrics: [libraryMetric, otherMetric] });

    expect(await screen.findByText("Revenue")).toBeInTheDocument();
    expect(libraryTab()).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Churn")).not.toBeInTheDocument();
  });

  it("keeps Library selected while the metrics are loading", async () => {
    let resolveResponse: () => void = () => {};
    fetchMock.get(
      "path:/api/exploration/dimensions",
      new Promise((resolve) => {
        resolveResponse = () => resolve({ metrics: [], dimension_groups: [] });
      }),
    );
    renderWithProviders(
      <AddMetricsModal
        opened
        onClose={jest.fn()}
        selection={makeMockSelection()}
      />,
    );

    try {
      expect(libraryTab()).toHaveAttribute("aria-selected", "true");
      expect(allTab()).toHaveAttribute("aria-selected", "false");
    } finally {
      // Resolve even on assertion failure: the global afterEach awaits in-flight requests, and a forever-pending one times out the rest of the file.
      resolveResponse();
    }
    expect(await screen.findByText("No results")).toBeInTheDocument();
  });

  it("switches to the All tab when there is nothing in the library", async () => {
    setup({ metrics: [otherMetric] });

    expect(await screen.findByText("Churn")).toBeInTheDocument();
    expect(allTab()).toHaveAttribute("aria-selected", "true");
    expect(libraryTab()).toHaveAttribute("aria-selected", "false");
  });

  it("switches to the All tab when every library metric is already in the plan", async () => {
    setup({
      metrics: [libraryMetric, otherMetric],
      blocks: [mockMetricBlock(libraryMetric)],
    });

    expect(await screen.findByText("Churn")).toBeInTheDocument();
    expect(allTab()).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Revenue")).not.toBeInTheDocument();
  });

  it("falls back to the All tab when a search matches nothing in the library", async () => {
    setup({ metrics: [libraryMetric, otherMetric] });

    expect(await screen.findByText("Revenue")).toBeInTheDocument();

    await userEvent.type(
      screen.getByPlaceholderText("Search for a metric"),
      "Churn",
    );

    expect(await screen.findByText("Churn")).toBeInTheDocument();
    expect(allTab()).toHaveAttribute("aria-selected", "true");
  });

  it("re-derives the tab when reopened after adding every library metric", async () => {
    setupExplorationDataEndpoint([libraryMetric, otherMetric]);
    const { rerender } = renderWithProviders(
      <AddMetricsModal
        opened
        onClose={jest.fn()}
        selection={makeMockSelection()}
      />,
    );

    expect(await screen.findByText("Revenue")).toBeInTheDocument();

    await userEvent.click(allTab());
    await userEvent.click(libraryTab());

    const planWithLibraryMetric = makeMockSelection({
      blocks: [mockMetricBlock(libraryMetric)],
    });
    rerender(
      <AddMetricsModal
        opened={false}
        onClose={jest.fn()}
        selection={planWithLibraryMetric}
      />,
    );
    rerender(
      <AddMetricsModal
        opened
        onClose={jest.fn()}
        selection={planWithLibraryMetric}
      />,
    );

    expect(await screen.findByText("Churn")).toBeInTheDocument();
    expect(allTab()).toHaveAttribute("aria-selected", "true");
  });

  it("keeps an explicitly chosen tab during searches", async () => {
    setup({ metrics: [libraryMetric, otherMetric] });

    expect(await screen.findByText("Revenue")).toBeInTheDocument();

    await userEvent.click(allTab());
    await userEvent.click(libraryTab());
    await userEvent.type(
      screen.getByPlaceholderText("Search for a metric"),
      "Churn",
    );

    expect(await screen.findByText("No results")).toBeInTheDocument();
    expect(libraryTab()).toHaveAttribute("aria-selected", "true");
  });
});
