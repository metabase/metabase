import type { ComponentType } from "react";

import type { Column, RowValue, Series } from "./data";
import type { TextHeightMeasurer, TextWidthMeasurer } from "./measure-text";
import type {
  CreateDefineSetting,
  CustomVisualizationSettingDefinition,
} from "./viz-settings";

/**
 * Export this function to define a custom visualization.
 */
export type CreateCustomVisualization<
  CustomVisualizationSettings extends Record<string, unknown>,
> = (
  props: CreateCustomVisualizationProps<CustomVisualizationSettings>,
) => CustomVisualization<CustomVisualizationSettings>;

export type CreateCustomVisualizationProps<
  CustomVisualizationSettings extends Record<string, unknown>,
> = {
  defineSetting: ReturnType<CreateDefineSetting<CustomVisualizationSettings>>;

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
  width: number | null;

  height: number | null;

  series: Series;

  settings: CustomVisualizationSettings;

  onClick: (
    clickObject: ClickObject<CustomVisualizationSettings> | null,
  ) => void;

  onHover: (hoverObject?: HoverObject | null) => void;
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

export type HoverObject = {
  index?: number;
  seriesIndex?: number;
  value?: unknown;
  column?: Column;
  data?: HoveredDataPoint[];
  dimensions?: HoveredDimension[];
  element?: Element;
  event?: MouseEvent;
};

export type ClickBehavior = Record<string, unknown>;
