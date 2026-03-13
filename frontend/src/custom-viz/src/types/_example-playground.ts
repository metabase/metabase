import type {
  CreateCustomVisualization,
  CustomVisualizationProps,
} from "./viz";

type MyVizSettings = {
  apiKey?: string;
  custom?: boolean;
  threshold?: number;
};

type CustomWidgetProps = {
  options: boolean[];
};

export const createMyViz: CreateCustomVisualization<MyVizSettings> = ({}) => {
  return {
    id: "my-custom-viz",
    getName: () => "My custom viz",
    minSize: { width: 1, height: 1 },
    defaultSize: { width: 2, height: 2 },
    isSensible({ cols, rows }) {
      return (
        cols.length === 1 && rows.length === 1 && typeof rows[0][0] === "number"
      );
    },
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
      apiKey: {
        id: "api-key-setting",
        widget: "input",
        getProps() {
          return {};
        },
      },
      custom: {
        id: "2",
        widget: CustomWidget,
        getProps() {
          return {};
        },
      },
      threshold: {
        id: "1",
        widget: "number",
        getProps(_, settings) {
          return {};
        },
      },
    },
    VisualizationComponent: MyVizComponent,
  };
};

const MyVizComponent = (props: CustomVisualizationProps<MyVizSettings>) => {
  return null;
};

const CustomWidget = (props: CustomWidgetProps) => {
  return null;
};

window.registerCustomViz(createMyViz);
