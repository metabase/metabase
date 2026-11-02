import { render, screen } from "@testing-library/react";
import React, { Component, Suspense } from "react";

import { setChunkErrorFallback } from "metabase/utils/lazy-chunk";
import type { VisualizationDisplay } from "metabase-types/api";

import {
  getRegisteredComponent,
  loadVisualizationComponents,
  registerVisualization,
} from "./registry";

class ChunkErrorBoundary extends Component<
  { children: React.ReactNode },
  { message: string | null }
> {
  // The cast gives the initial null a nullable type rather than `null`.
  state = { message: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message };
  }

  render() {
    return this.state.message ?? this.props.children;
  }
}

const createDefinition = (identifier: VisualizationDisplay) => ({
  getUiName: () => identifier,
  identifier,
  iconName: "unknown" as const,
  settings: {},
  checkRenderable: () => undefined,
});

describe("registerVisualization", () => {
  it("keeps the component loader when the definition is already registered", () => {
    // Storybook evaluates both registries into one module, and static-viz
    // registers its bare definitions first. The app's registration is then a
    // duplicate, but its loader is the only way to reach the component.
    // A cast is needed because the registry is keyed by the known display types.
    const display = "already-registered" as VisualizationDisplay;
    const definition = createDefinition(display);
    const Chart = Object.assign(() => <div />, definition);

    registerVisualization(definition);
    expect(() =>
      registerVisualization(definition, () => Promise.resolve(Chart)),
    ).toThrow(/already registered/);

    expect(getRegisteredComponent(display)).toBeDefined();
  });
});

describe("a chunk that fails to download", () => {
  beforeEach(() => {
    setChunkErrorFallback(() => <div>chart unavailable</div>);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    setChunkErrorFallback(() => null);
  });

  it("retries, then renders the fallback in place of the chart", async () => {
    // A cast is needed because the registry is keyed by the known display types.
    const display = "download-fails" as VisualizationDisplay;
    const definition = createDefinition(display);

    let attempts = 0;
    registerVisualization(definition, () => {
      attempts += 1;
      return Promise.reject(new Error("Loading chunk 42 failed."));
    });

    const failing = getRegisteredComponent(display);
    render(
      <ChunkErrorBoundary>
        <Suspense fallback={<div>loading</div>}>
          {failing ? React.createElement(failing) : null}
        </Suspense>
      </ChunkErrorBoundary>,
    );

    // The retry backoff runs longer than the default findBy timeout.
    expect(
      await screen.findByText("chart unavailable", undefined, {
        timeout: 5000,
      }),
    ).toBeInTheDocument();
    // The initial attempt plus four retries.
    expect(attempts).toBe(5);
  });

  it("reports a chart that throws once loaded rather than retrying it", async () => {
    // A cast is needed because the registry is keyed by the known display types.
    const display = "chart-throws" as VisualizationDisplay;
    const definition = createDefinition(display);

    let attempts = 0;
    registerVisualization(definition, () => {
      attempts += 1;
      return Promise.reject(new Error("the chart itself is broken"));
    });

    const failing = getRegisteredComponent(display);
    render(
      <ChunkErrorBoundary>
        <Suspense fallback={<div>loading</div>}>
          {failing ? React.createElement(failing) : null}
        </Suspense>
      </ChunkErrorBoundary>,
    );

    expect(
      await screen.findByText("the chart itself is broken"),
    ).toBeInTheDocument();
    expect(attempts).toBe(1);
  });
});

describe("loadVisualizationComponents", () => {
  it("registers the component so the chart renders without suspending", async () => {
    // A cast is needed because the registry is keyed by the known display types.
    const display = "loaded-eagerly" as VisualizationDisplay;
    const definition = createDefinition(display);
    const Chart = Object.assign(() => <div />, definition);

    registerVisualization(definition, () => Promise.resolve(Chart));
    await loadVisualizationComponents();

    expect(getRegisteredComponent(display)).toBe(Chart);
  });
});
