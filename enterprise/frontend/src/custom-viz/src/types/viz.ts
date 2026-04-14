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
  value?: RowValue;
  column?: Column;
  dimensions?: ClickObjectDimension[];
  event?: MouseEvent;
  element?: Element;
  // seriesIndex?: number;
  // cardId?: CardId;
  settings?: CustomVisualizationSettings<TSettings>;
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
