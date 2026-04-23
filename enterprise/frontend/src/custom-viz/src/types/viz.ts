import type { ComponentType } from "react";

import type { Column, RowValue, Series } from "./data";
import type { TextHeightMeasurer, TextWidthMeasurer } from "./measure-text";
import type {
  CreateDefineSetting,
  CustomVisualizationSettingDefinition,
  CustomVisualizationSettings,
} from "./viz-settings";

/**
 * Export this function to define a custom visualization.
 */
export type CreateCustomVisualization<
  TSettings extends Record<string, unknown>,
> = (
  props: CreateCustomVisualizationProps<TSettings>,
) => CustomVisualization<TSettings>;

export type CreateCustomVisualizationProps<
  TSettings extends Record<string, unknown>,
> = {
  defineSetting: ReturnType<CreateDefineSetting<TSettings>>;

  /**
   * Returns a URL for a static asset declared in the plugin manifest.
   * Use this to reference images and other static files from your plugin.
   * @example getAssetUrl("icon.svg")
   */
  getAssetUrl: (assetPath: string) => string;

  /**
   * Locale to render visualization with (e.g. "de", "ja", "en").
   */
  locale: string;
};

export type CustomVisualization<TSettings extends Record<string, unknown>> = {
  /**
   * A unique visualization identifier. It's not shown in the UI.
   */
  id: string;

  /**
   * Returns visualization name to be shown in the UI.
   */
  getName(): string;

  /**
   * Set to false to disable saving the question as PNG.
   */
  canSavePng?: boolean;

  /**
   * Set to true to disable the default visualization header.
   */
  noHeader?: boolean;

  /**
   * Min size on dashboard grid.
   */
  minSize?: VisualizationGridSize;

  /**
   * Default size on dashboard grid.
   */
  defaultSize?: VisualizationGridSize;

  /**
   * Visualization settings definitions.
   */
  settings?: Record<
    keyof TSettings,
    CustomVisualizationSettingDefinition<TSettings>
  >;

  /**
   * This function should throw if the visualization cannot be rendered with given data and settings.
   */
  checkRenderable: (
    series: Series,
    settings: CustomVisualizationSettings<TSettings>,
  ) => void | never;

  /**
   * Component that renders the visualization.
   */
  VisualizationComponent: ComponentType<CustomVisualizationProps<TSettings>>;

  /**
   * Component that renders the visualization.
   */
  StaticVisualizationComponent?: ComponentType<
    CustomStaticVisualizationProps<TSettings>
  >;
};

export type BaseWidgetProps<
  TValue,
  TSettings extends Record<string, unknown>,
> = {
  id: string;
  value: TValue | undefined;
  onChange: (value?: TValue | null) => void;
  onChangeSettings: (
    settings: Partial<CustomVisualizationSettings<TSettings>>,
  ) => void;
};

export type VisualizationGridSize = {
  /**
   * Number of grid columns in a Metabase dashboard.
   */
  width: number;

  /**
   * Number of grid rows in a Metabase dashboard.
   */
  height: number;
};

export type CustomVisualizationProps<
  TSettings extends Record<string, unknown>,
> = {
  width: number | null;

  height: number | null;

  series: Series;

  settings: CustomVisualizationSettings<TSettings>;

  colorScheme: "light" | "dark";

  onClick: (
    clickObject: ClickObject<CustomVisualizationSettings<TSettings>> | null,
  ) => void;

  onHover: (hoverObject?: HoverObject | null) => void;
};

export type ColorGetter = (colorName: string) => string;

export interface RenderingContext {
  getColor: ColorGetter;
  measureText: TextWidthMeasurer;
  measureTextHeight: TextHeightMeasurer;
  fontFamily: string;
}

export type CustomStaticVisualizationProps<
  TSettings extends Record<string, unknown>,
> = {
  series: Series;
  settings: CustomVisualizationSettings<TSettings>;
  renderingContext: RenderingContext;
};

export type ClickObject<TSettings extends Record<string, unknown>> = {
  /** The raw value of the clicked cell. */
  value?: RowValue;

  /** Column metadata for the clicked cell. */
  column?: Column;

  /**
   * Dimension values associated with the clicked data point.
   * For example, when clicking a bar in a bar chart, dimensions
   * contain the breakout values (e.g. the category and date) that
   * identify the clicked bar.
   */
  dimensions?: ClickObjectDimension[];

  /** The browser MouseEvent that triggered the click. Used to position popovers. */
  event?: MouseEvent;

  /** The DOM element that was clicked. Used to anchor popovers. */
  element?: Element;

  /** Visualization settings at the time of the click. */
  settings?: CustomVisualizationSettings<TSettings>;

  /**
   * The full row of data and column metadata for the clicked data point.
   * Provides access to the raw row values and their columns — useful when
   * the click needs context beyond the single clicked cell.
   */
  origin?: {
    /** All values in the clicked row. */
    row: RowValue[];
    /** Column metadata for each value in `row`. */
    cols: Column[];
  };

  /**
   * Column–value pairs for every column in the clicked row.
   * Used by the drill-through system to determine available actions
   * (e.g. filtering, detail views).
   */
  data?: ClickObjectDataRow[];
};

/** A single column–value pair within a {@link ClickObject.data} array. */
export interface ClickObjectDataRow {
  /** Column metadata. May be `null` for computed/custom columns. */
  col: Column | null;
  /** The raw value for this column in the clicked row. */
  value: RowValue;
}

/** A dimension value associated with a clicked data point. */
export interface ClickObjectDimension {
  /** The raw value of the dimension. */
  value: RowValue;
  /** Column metadata for the dimension. */
  column: Column;
}

/** A single data point shown as a row in the hover tooltip. */
export type HoveredDataPoint = {
  /** Label displayed in the tooltip row. */
  key: string;
  /** The raw value displayed in the tooltip row. */
  value: RowValue;
  /** Column metadata used to format the value. */
  col: Column;
};

/** A dimension value shown in the hover tooltip. */
export type HoveredDimension = {
  /** The raw dimension value. */
  value: RowValue;
  /** Column metadata for the dimension. */
  column: Column;
};

export type HoverObject = {
  /**
   * Index of the hovered series. Used by the legend to highlight
   * the active series and mute the others.
   */
  index?: number;

  /** Index of the hovered series within the series array. */
  seriesIndex?: number;

  /** The raw value of the hovered data point. Used as a single-row tooltip when `data` and `dimensions` are absent. */
  value?: unknown;

  /** Column metadata for the hovered value. Used for formatting in the tooltip. */
  column?: Column;

  /**
   * Array of column–value pairs to display as rows in the tooltip.
   * This is the primary way to provide tooltip content.
   */
  data?: HoveredDataPoint[];

  /**
   * Dimension values for the hovered data point.
   * Used as fallback tooltip content when `data` is not provided.
   */
  dimensions?: HoveredDimension[];

  /** The DOM element being hovered. Used to anchor the tooltip popover. */
  element?: Element;

  /** The browser MouseEvent. Used as a fallback anchor when `element` is not available. */
  event?: MouseEvent;
};

declare const ClickBehaviorSymbol: unique symbol;

/**
 * Opaque/engine-owned click behavior config.
 *
 * This is intentionally not a structural type: custom visualization authors
 * should treat it as an opaque value (pass through only).
 */
export type ClickBehavior = {
  readonly [ClickBehaviorSymbol]: "ClickBehavior";
};
