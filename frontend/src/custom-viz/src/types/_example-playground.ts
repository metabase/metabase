import { createDefineSetting } from "../lib";

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

export const createMyViz: CreateCustomVisualization<MyVizSettings> = ({
  getAssetUrl: _getAssetUrl,
}) => {
  const defineSetting = createDefineSetting<MyVizSettings>();

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
