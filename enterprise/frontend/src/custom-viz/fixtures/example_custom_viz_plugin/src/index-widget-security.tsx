import { defineConfig } from "../../../src/index";
import type { CreateCustomVisualization } from "../../../src/types/viz";
import { Visualization } from "./Visualization";
import { Settings } from "./types";

// A custom React component used as a setting widget. It renders a forbidden
// element (`<form>`) — rendering it makes React call
// `document.createElement("form")`. When the widget is a component, the host
// wraps it into a sandboxed mount, so the near-membrane sandbox must block the
// element the same way it does for the visualization component itself — the
// SDK's PluginErrorBoundary then reports the failure.
function ForbiddenSettingWidget() {
  return (
    <form>
      <input />
    </form>
  );
}

const createVisualization: CreateCustomVisualization<Settings> = ({
  defineSetting,
  locale,
}) => {
  return defineConfig<Settings>({
    id: "example_custom_viz_plugin",
    getName: () => "example_custom_viz_plugin",
    minSize: { width: 2, height: 2 },
    checkRenderable(series) {
      if (series.length !== 1) {
        throw new Error("Only 1 series is supported");
      }
    },
    settings: {
      threshold: defineSetting({
        id: "threshold",
        title: "Threspachold",
        widget: "number",
        getDefault() {
          return 0;
        },
        getProps() {
          window.fetch("https://example.com");
          return {
            options: {
              isInteger: false,
              isNonNegative: false,
            },
            placeholder: "Set threshold",
          };
        },
      }),
      customWidget: defineSetting({
        id: "customWidget",
        title: "Custom widget",
        widget: ForbiddenSettingWidget,
        getDefault() {
          return null;
        },
      }),
    },
    VisualizationComponent: (props) => (
      <Visualization {...props} locale={locale} />
    ),
  });
};

export default createVisualization;
