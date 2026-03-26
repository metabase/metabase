import { defineSetting } from "../lib";

import type {
  CreateCustomVisualization,
  CustomStaticVisualizationProps,
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

const createMyViz: CreateCustomVisualization<MyVizSettings> = ({
  columnTypes: _columnTypes,
  formatValue: _formatValue,
  measureText: _measureText,
}) => {
  return {
    id: "my-custom-viz",
    getName: () => "My custom viz",
    isSensible() {
      return true;
    },
    checkRenderable() {},
    settings: {
      apiKey: defineSetting({
        id: "api-key-setting",
        widget: "input",
        getProps() {
          return {};
        },
      }),
      custom: defineSetting({
        id: "2",
        widget: CustomWidget,
        getProps() {
          return {
            options: [],
          };
        },
      }),
      threshold: defineSetting({
        id: "1",
        widget: "number",
        getProps(_series, _settings) {
          return {};
        },
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

const CustomWidget = (_props: CustomWidgetProps) => {
  return null;
};

// eslint-disable-next-line import/no-default-export
export default createMyViz;
