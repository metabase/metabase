import type { ColumnTypes } from "custom-viz/src/types/column-types";
import type { CreateCustomVisualization } from "custom-viz/src/types/viz";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";

import {
  measureText,
  measureTextHeight,
  measureTextWidth,
} from "metabase/utils/measure-text";
import { formatValue } from "metabase/visualizations/custom-visualizations/custom-viz-utils";
import { customVizColumnTypes } from "metabase-lib/v1/types/utils/custom-viz-column-types";

declare global {
  interface Window {
    __METABASE_VIZ_API__?: {
      React: typeof React;
      jsxRuntime: typeof jsxRuntime;
      columnTypes: ColumnTypes;
      formatValue: typeof formatValue;
      measureText: typeof measureText;
      measureTextWidth: typeof measureTextWidth;
      measureTextHeight: typeof measureTextHeight;
    };
    __customVizPlugin__?: CreateCustomVisualization<Record<string, unknown>>;
  }
}

export function ensureVizApi() {
  window.__METABASE_VIZ_API__ = {
    ...window.__METABASE_VIZ_API__,
    React,
    jsxRuntime,
    columnTypes: customVizColumnTypes,
    formatValue,
    measureText,
    measureTextWidth,
    measureTextHeight,
  };
}

export {};
