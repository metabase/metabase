import type { ComponentType } from "react";

import type { ColumnTypes } from "./column-types";
import type { Column, DatasetData, RowValue, Series } from "./data";
import type { FormatValue } from "./format";
import type {
  TextHeightMeasurer,
  TextMeasurer,
  TextWidthMeasurer,
} from "./measure-text";

/**
 * Export this function to define a custom visualization.
 */
export type CreateCustomVisualization<CustomVisualizationSettings> = (
  props: CreateCustomVisualizationProps,
) => CustomVisualization<CustomVisualizationSettings>;

export type CreateCustomVisualizationProps = {
  /**
   * Current user's locale (e.g., "de", "ja", "en").
   */
  locale: string;

  /**
   * Translates text using ttag function used in Metabase.
   */
  translate: (text: string) => string;

  /**
   * Returns a URL for a static asset declared in the plugin manifest.
   * Use this to reference images and other static files from your plugin.
   * @example getAssetUrl("icon.svg")
   */
  getAssetUrl: (assetPath: string) => string;

  /**
   * Column type predicates for checking semantic/base/effective types of columns.
   */
  columnTypes: ColumnTypes;

  /**
   * Formats a value for display based on column type and options.
   * Always returns a string (never JSX).
   */
  formatValue: FormatValue;

  /**
   * Measures text dimensions (width and height) for given text and font style.
   */
  measureText: TextMeasurer;

  /**
   * Measures text width for given text and font style.
   */
  measureTextWidth: TextWidthMeasurer;

  /**
   * Measures text height for given text and font style.
   */
  measureTextHeight: TextHeightMeasurer;
};

declare const SettingDefinitionSymbol: unique symbol;

export type CustomVisualizationSettingDefinition<_CustomVisualizationSettings> =
  {
    readonly [SettingDefinitionSymbol]: never;
  };

export type CustomVisualization<CustomVisualizationSettings> = {
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
   * Set to true to disable the default visulization header.
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
    keyof CustomVisualizationSettings,
    CustomVisualizationSettingDefinition<CustomVisualizationSettings>
  >;

  /**
   * This function should return true if the data shape makes sense for this visualization.
   * TODO: should it get series: Series instead?
   */
  isSensible: (data: DatasetData) => boolean;

  /**
   * This function should throw if the visualization cannot be rendered with given data and settings.
   */
  checkRenderable: (
    series: Series,
    settings: CustomVisualizationSettings,
  ) => void | never;

  /**
   * Component that renders the visualization.
   */
  VisualizationComponent: ComponentType<
    CustomVisualizationProps<CustomVisualizationSettings>
  >;

  /**
   * Component that renders the visualization.
   */
  StaticVisualizationComponent?: ComponentType<
    CustomStaticVisualizationProps<CustomVisualizationSettings>
  >;
};

export type BaseWidgetProps<TValue, CustomVisualizationSettings> = {
  id: string;
  value: TValue | undefined;
  onChange: (value?: TValue | null) => void;
  onChangeSettings: (settings: Partial<CustomVisualizationSettings>) => void;
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

export type CustomVisualizationProps<CustomVisualizationSettings> = {
  width: number;

  height: number;

  series: Series;

  settings: CustomVisualizationSettings;

  onVisualizationClick: (
    clickObject: ClickObject<CustomVisualizationSettings> | null,
  ) => void;

  onHoverChange: (hoverObject?: HoveredObject | null) => void;
};

export type ColorGetter = (colorName: string) => string;

export interface RenderingContext {
  getColor: ColorGetter;
  measureText: TextWidthMeasurer;
  measureTextHeight: TextHeightMeasurer;
  fontFamily: string;
  // theme: VisualizationTheme;
}

// Equivalent of StaticVisualizationProps
export type CustomStaticVisualizationProps<CustomVisualizationSettings> = {
  series: Series;
  renderingContext: RenderingContext;
  isStorybook?: boolean;
  settings: CustomVisualizationSettings;
  hasDevWatermark?: boolean;
};

export type ClickObject<CustomVisualizationSettings> = {
  value?: RowValue;
  column?: Column;
  dimensions?: ClickObjectDimension[];
  event?: MouseEvent;
  element?: Element;
  // seriesIndex?: number;
  // cardId?: CardId;
  settings?: CustomVisualizationSettings;
  // columnShortcuts?: boolean;
  origin?: {
    row: RowValue[];
    cols: Column[];
  };
  // extraData?: Record<string, unknown>;
  // data?: ClickObjectDataRow[];
};

export interface ClickObjectDimension {
  value: RowValue;
  column: Column;
}

export type HoveredDataPoint = {
  key: string;
  value: RowValue;
  col: Column;
};

export type HoveredDimension = {
  value: RowValue;
  column: Column;
};

export type HoveredObject = {
  index?: number;
  seriesIndex?: number;
  value?: unknown;
  column?: Column;
  data?: HoveredDataPoint[];
  dimensions?: HoveredDimension[];
  element?: Element;
  event?: MouseEvent;
};
