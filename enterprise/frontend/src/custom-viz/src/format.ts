/**
 * Value formatting utilities.
 *
 * At runtime inside a plugin bundle, this delegates to
 * `window.__METABASE_VIZ_API__.formatValue` which is set by Metabase
 * before the plugin executes.
 */
import type { FormatValue, FormatValueOptions } from "./types/format";

declare const window: { __METABASE_VIZ_API__?: { formatValue: FormatValue } };

export const formatValue: FormatValue = (value, options) =>
  window.__METABASE_VIZ_API__!.formatValue(value, options);

export type { FormatValue, FormatValueOptions };
