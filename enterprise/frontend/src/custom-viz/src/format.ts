/**
 * Value formatting utilities.
 *
 * At runtime inside a plugin bundle, this delegates to
 * `window.__METABASE_VIZ_API__.formatValue` which is set by Metabase
 * before the plugin executes.
 */
import type { FormatValue, FormatValueOptions } from "./types/format";

declare const window: { __METABASE_VIZ_API__?: { formatValue: FormatValue } };

export const formatValue: FormatValue = (value, options) => {
  const api = window.__METABASE_VIZ_API__;
  if (!api) {
    throw new Error(
      // eslint-disable-next-line metabase/no-literal-metabase-strings
      "Metabase Viz API not initialized. formatValue can only be called inside a running Metabase instance.",
    );
  }
  return api.formatValue(value, options);
};

export type { FormatValue, FormatValueOptions };
