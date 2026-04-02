import React from "react";
import * as jsxRuntime from "react/jsx-runtime";

import {
  measureText,
  measureTextHeight,
  measureTextWidth,
} from "metabase/lib/measure-text";
import * as isa from "metabase-lib/v1/types/utils/isa";

import type { CustomVizPluginDefinition } from "./custom-viz-types";
import { formatValue } from "./custom-viz-utils";

declare global {
  interface Window {
    __METABASE_VIZ_API__?: {
      React: typeof React;
      jsxRuntime: typeof jsxRuntime;
      columnTypes: typeof isa;
      formatValue: typeof formatValue;
      measureText: typeof measureText;
      measureTextWidth: typeof measureTextWidth;
      measureTextHeight: typeof measureTextHeight;
    };
    __customVizPlugin__?: (
      ...args: unknown[]
    ) => CustomVizPluginDefinition | null | undefined;
  }
}

export function ensureVizApi() {
  window.__METABASE_VIZ_API__ = {
    ...window.__METABASE_VIZ_API__,
    React,
    jsxRuntime,
    columnTypes: isa,
    formatValue,
    measureText,
    measureTextWidth,
    measureTextHeight,
  };
}

export {};
