import type { ColumnTypes, CreateCustomVisualization } from "custom-viz";

import { formatValue } from "metabase/visualizations/custom-visualizations/custom-viz-utils";
import { customVizColumnTypes } from "metabase-lib/v1/types/utils/custom-viz-column-types";

declare global {
  interface Window {
    __METABASE_VIZ_API__?: {
      columnTypes: ColumnTypes;
      formatValue: typeof formatValue;
    };
    __customVizPlugin__?: CreateCustomVisualization<Record<string, unknown>>;
  }
}

export function ensureVizApi() {
  window.__METABASE_VIZ_API__ = {
    ...window.__METABASE_VIZ_API__,
    columnTypes: customVizColumnTypes,
    formatValue,
  };
}

export {};
