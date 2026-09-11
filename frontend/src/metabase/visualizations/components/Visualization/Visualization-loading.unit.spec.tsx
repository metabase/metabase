import type { ComponentProps } from "react";

import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { delay } from "__support__/utils";
import VisualizationComponent from "metabase/visualizations/components/Visualization";
import type { Visualization } from "metabase/visualizations/types";
import { registerVisualization } from "metabase/viz-core";
import type { VisualizationDisplay } from "metabase-types/api";
import {
  createMockCard,
  createMockDatasetData,
  createMockNumericColumn,
} from "metabase-types/api/mocks";

const createDefinition = (display: VisualizationDisplay) => ({
  getUiName: () => String(display),
  identifier: display,
  iconName: "unknown" as const,
  minSize: { width: 1, height: 1 },
  defaultSize: { width: 4, height: 4 },
  settings: {},
  isSensible: () => false,
  checkRenderable: () => undefined,
});

const createChart = (display: VisualizationDisplay) =>
  Object.assign(
    () => <div>{`${display} chart`}</div>,
    createDefinition(display),
  );

/** A visualization whose chunk resolves only when the test says so. */
function registerDeferred(name: string) {
  // A cast is needed because the registry is keyed by the known display types.
  const display = name as VisualizationDisplay;
  const definition = createDefinition(display);
  let resolveComponent!: () => void;
  const chunk = new Promise<Visualization>((resolve) => {
    resolveComponent = () => resolve(createChart(display));
  });
  registerVisualization(definition, () => chunk);
  return { display, resolveComponent };
}

// A card with no `data` is the shape the card has while its query runs, which
// is why the prop accepts a bare card alongside a full series.
type CardSeries = NonNullable<
  ComponentProps<typeof VisualizationComponent>["rawSeries"]
>;

const seriesFor = (
  display: VisualizationDisplay,
  withData: boolean,
): CardSeries => [
  withData
    ? {
        card: createMockCard({ display }),
        data: createMockDatasetData({
          cols: [createMockNumericColumn({ name: "Count" })],
          rows: [[1]],
        }),
      }
    : { card: createMockCard({ display }) },
];

const renderCard = (series: CardSeries) =>
  renderWithProviders(
    <VisualizationComponent rawSeries={series} isDashboard />,
    { storeInitialState: createMockState({ settings: mockSettings() }) },
  );

const loadingIndicator = () => screen.queryByTestId("loading-indicator");

describe("Visualization loading states", () => {
  it("shows one loading state while the data and the chunk load in parallel", async () => {
    const { display, resolveComponent } = registerDeferred("parallel-load");
    const { rerender } = renderCard(seriesFor(display, false));
    await delay(0);

    expect(loadingIndicator()).toBeInTheDocument();

    // Data arrives first, the chunk is still in flight. The card must not
    // swap one loading state for a different one.
    rerender(
      <VisualizationComponent
        rawSeries={seriesFor(display, true)}
        isDashboard
      />,
    );
    await delay(0);
    expect(loadingIndicator()).toBeInTheDocument();

    resolveComponent();
    expect(await screen.findByText(`${display} chart`)).toBeInTheDocument();
    expect(loadingIndicator()).not.toBeInTheDocument();
  });

  it("shows one loading state when the data is ready and the chunk is not", async () => {
    const { display, resolveComponent } = registerDeferred("data-first");
    renderCard(seriesFor(display, true));
    await delay(0);

    expect(loadingIndicator()).toBeInTheDocument();

    resolveComponent();
    expect(await screen.findByText(`${display} chart`)).toBeInTheDocument();
    expect(loadingIndicator()).not.toBeInTheDocument();
  });

  it("shows one loading state when the chunk is ready and the data is not", async () => {
    const { display, resolveComponent } = registerDeferred("chunk-first");
    resolveComponent();

    const { rerender } = renderCard(seriesFor(display, false));
    await delay(0);
    expect(loadingIndicator()).toBeInTheDocument();

    rerender(
      <VisualizationComponent
        rawSeries={seriesFor(display, true)}
        isDashboard
      />,
    );
    expect(await screen.findByText(`${display} chart`)).toBeInTheDocument();
    expect(loadingIndicator()).not.toBeInTheDocument();
  });

  it("shows no loading state when both are already available", async () => {
    // A cast is needed because the registry is keyed by the known display types.
    const display = "both-ready" as VisualizationDisplay;
    registerVisualization(createChart(display));

    renderCard(seriesFor(display, true));

    expect(loadingIndicator()).not.toBeInTheDocument();
    expect(screen.getByText(`${display} chart`)).toBeInTheDocument();
    await waitFor(() => expect(loadingIndicator()).not.toBeInTheDocument());
  });
});
