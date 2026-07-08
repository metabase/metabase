import React from "react";

import { defineConfig } from "../../../src/index";
import type { CreateCustomVisualization } from "../../../src/types/viz";

type Settings = {
  forbiddenWidget?: string | null;
};

function ForbiddenSettingWidget() {
  return (
    <form>
      <input />
    </form>
  );
}

const createVisualization: CreateCustomVisualization<Settings> = ({
  defineSetting,
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
      forbiddenWidget: defineSetting({
        id: "forbiddenWidget",
        title: "Forbidden widget",
        widget: ForbiddenSettingWidget,
        getDefault() {
          return null;
        },
      }),
    },
    VisualizationComponent: () => <h1>Custom viz rendered successfully</h1>,
  });
};

export default createVisualization;
