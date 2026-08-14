import {
  getVisualizationComponent,
  loadVisualizationComponents,
  registerVisualization,
} from "metabase/visualizations";
import type { VisualizationDisplay } from "metabase-types/api";

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

    expect(getVisualizationComponent(display)).toBeDefined();
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

    expect(getVisualizationComponent(display)).toBe(Chart);
  });
});
