import type { ColumnTypes, CreateCustomVisualization } from "custom-viz";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- typeof needs a value import
import * as ReactModule from "react";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- typeof needs a value import
import * as JsxRuntimeModule from "react/jsx-runtime";

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
      columnTypes: ColumnTypes;
      formatValue: typeof formatValue;
      measureText: typeof measureText;
      measureTextWidth: typeof measureTextWidth;
      measureTextHeight: typeof measureTextHeight;
      // Exposed only by the static-viz bundle (for plugin bundles that reference them); the app
      // path (ensureVizApi) leaves these unset, so they're optional.
      React?: typeof ReactModule;
      jsxRuntime?: typeof JsxRuntimeModule;
    };
    __customVizPlugin__?: CreateCustomVisualization<Record<string, unknown>>;
  }
}

export function ensureVizApi() {
  window.__METABASE_VIZ_API__ = {
    ...window.__METABASE_VIZ_API__,
    columnTypes: customVizColumnTypes,
    formatValue,
    measureText,
    measureTextWidth,
    measureTextHeight,
  };
}

export {};
