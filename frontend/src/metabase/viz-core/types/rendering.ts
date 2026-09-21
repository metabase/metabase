import type { ColorGetter } from "metabase/ui/colors/types";
import type {
  TextHeightMeasurer,
  TextWidthMeasurer,
} from "metabase/utils/measure-text";
import type { ColumnSettings, RawSeries, RowValue } from "metabase-types/api";

export interface Padding {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export type Formatter = (
  value: RowValue,
  options?: ColumnSettings,
) => string | null;

export type Extent = [number, number];

export interface RenderingContext {
  getColor: ColorGetter;
  measureText: TextWidthMeasurer;
  measureTextHeight: TextHeightMeasurer;
  fontFamily: string;
  /** Defaults to "light" when not provided. */
  colorScheme?: "light" | "dark";

  theme: VisualizationTheme;
}

/**
 * Visualization theming overrides.
 * Refer to DEFAULT_METABASE_COMPONENT_THEME for the default values.
 **/
export interface VisualizationTheme {
  cartesian: {
    label: {
      fontSize: number;
    };
    goalLine: {
      label: {
        fontSize: number;
      };
    };
    splitLine: {
      lineStyle: {
        color: string;
      };
    };
  };
  pie: {
    borderColor: string;
  };
}

export interface StaticVisualizationProps {
  rawSeries: RawSeries;
  renderingContext: RenderingContext;
  isStorybook?: boolean;
  hasDevWatermark?: boolean;
  width?: number;
  height?: number;
  fitWithinBounds?: boolean;
}
