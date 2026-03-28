/**
 * Value formatting utilities.
 *
 * These are stub implementations that provide TypeScript types for plugin
 * development. At runtime, the Vite `metabaseVizExternals` plugin replaces
 * imports from "@metabase/custom-viz/format" with virtual modules that
 * read from `window.__METABASE_VIZ_API__.formatValue`.
 */
import type { FormatValue, FormatValueOptions } from "./types/format";

export const formatValue: FormatValue = () => "";

export type { FormatValue, FormatValueOptions };
