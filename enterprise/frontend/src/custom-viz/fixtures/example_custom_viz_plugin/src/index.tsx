import { defineConfig } from "../../../src/index";
import type { CreateCustomVisualization } from "../../../src/types/viz";
import { Visualization } from "./Visualization";

type Settings = {
  threshold?: number;
};

const createVisualization: CreateCustomVisualization<Settings> = ({
  defineSetting,
  locale,
}) => {
  return defineConfig<Settings>({
    id: "example_custom_viz_plugin",
    getName: () => "example_custom_viz_plugin",
    minSize: { width: 2, height: 2 },
    checkRenderable(series, settings) {
      if (series.length !== 1) {
        throw new Error("Only 1 series is supported");
      }

      const [
        {
          data: { cols, rows },
        },
      ] = series;

      if (cols.length !== 1) {
        throw new Error("Query results should only have 1 column");
      }

      if (rows.length !== 1) {
        throw new Error("Query results should only have 1 row");
      }

      if (typeof rows[0][0] !== "number") {
        throw new Error("Result is not a number");
      }

      if (typeof settings.threshold !== "number") {
        throw new Error("Threshold setting is not set");
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
