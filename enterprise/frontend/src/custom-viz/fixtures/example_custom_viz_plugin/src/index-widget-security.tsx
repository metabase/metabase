import { defineConfig } from "../../../src/index";
import type { CreateCustomVisualization } from "../../../src/types/viz";
import { Visualization } from "./Visualization";
import { Settings } from "./types";

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
    },
    VisualizationComponent: (props) => (
      <Visualization {...props} locale={locale} />
    ),
  });
};

export default createVisualization;
