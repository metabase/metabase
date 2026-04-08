import type {
  CreateCustomVisualization,
  CustomStaticVisualizationProps,
  CustomVisualizationProps,
} from "./viz";

type MyVizSettings = {
  apiKey?: string;
  custom?: boolean;
  threshold?: number;
  metricsColumn?: string;
};

export const createMyViz: CreateCustomVisualization<MyVizSettings> = ({
  defineSetting,
}) => {
  return {
    id: "my-custom-viz",
    getName: () => "My custom viz",
    checkRenderable() {},
    settings: {
      apiKey: defineSetting({
        id: "apiKey",
        widget: "input",
        getProps() {
          return {};
        },
        getDefault() {
          return "FFCCDD";
        },
      }),
      custom: defineSetting({
        id: "custom",
        widget: CustomWidget,
        getProps() {
          return {
            options: [],
          };
        },
        getDefault() {
          return true;
        },
      }),
      threshold: defineSetting({
        id: "threshold",
        widget: "number",
        getProps(_series, _settings) {
          return {};
        },
      }),
      metricsColumn: defineSetting({
        id: "metricsColumn",
        title: "Metrics column",
        widget: "field",
        persistDefault: true,
        index: 0,
        group: "Metrics",
        section: "Data",
        getDefault: (series) => series[0]?.data.cols[0]?.name,
        isValid: (series, settings) =>
          series[0]?.data.cols.some(
            (col) => col.name === settings.metricsColumn,
          ) ?? false,
        getProps: (series) => ({
          columns: series[0]?.data.cols ?? [],
          options: (series[0]?.data.cols ?? []).map((col) => ({
            name: col.display_name,
            value: col.name,
          })),
        }),
      }),
    },
    VisualizationComponent: MyVizComponent,
    StaticVisualizationComponent: MyStaticVizComponent,
  };
};

const MyVizComponent = (_props: CustomVisualizationProps<MyVizSettings>) => {
  return null;
};

const MyStaticVizComponent = (
  _props: CustomStaticVisualizationProps<MyVizSettings>,
) => {
  return null;
};

type CustomWidgetProps = {
  options: boolean[];
};

const CustomWidget = (_props: CustomWidgetProps) => {
  return null;
};

// eslint-disable-next-line import/no-default-export
export default createMyViz;
