/**
 * Text measurement utilities.
 *
 * These are stub implementations that provide TypeScript types for plugin
 * development. At runtime, the Vite `metabaseVizExternals` plugin replaces
 * imports from "@metabase/custom-viz" with virtual modules that
 * read from `window.__METABASE_VIZ_API__`.
 */
import type {
  TextHeightMeasurer,
  TextMeasurer,
  TextWidthMeasurer,
} from "./types/measure-text";

export const measureText: TextMeasurer = () => ({ width: 0, height: 0 });
export const measureTextWidth: TextWidthMeasurer = () => 0;
export const measureTextHeight: TextHeightMeasurer = () => 0;
