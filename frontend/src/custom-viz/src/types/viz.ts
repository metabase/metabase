import type { ComponentType } from "react";

import type { Column, DatasetData, RowValue, Series } from "./data";
import type { TextHeightMeasurer, TextWidthMeasurer } from "./measure-text";
import type { WidgetName, Widgets } from "./viz-settings";

/**
 * Export this function to define a custom visualization.
 */
export type CreateCustomVisualization<CustomVisualizationSettings> = (
  props: CreateCustomVisualizationProps,
) => CustomVisualization<CustomVisualizationSettings>;

export type CreateCustomVisualizationProps = {
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

  // settings: CustomVisualizationSettings;

  /**
   * TODO: add all the isa.js functions, ideally in a single object.
   * https://linear.app/metabase/issue/GDGT-1923/convert-isajs-to-typescript
   */
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
  minSize: VisualizationGridSize;

  /**
   * Default size on dashboard grid.
   */
  defaultSize: VisualizationGridSize;

  /**
   * Visualization settings definitions.
   */
  settings?: CustomVisualizationSettingsDefinitions<CustomVisualizationSettings>;

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
  StaticVisualizationComponent: ComponentType<
    CustomStaticVisualizationProps<CustomVisualizationSettings>
  >;
};

export type CustomVisualizationSettingsDefinitions<
  CustomVisualizationSettings,
  K extends keyof CustomVisualizationSettings =
    keyof CustomVisualizationSettings,
> = {
  [Key in K]-?: VisualizationSettingDefinition<
    unknown,
    CustomVisualizationSettings[Key],
    Record<string, unknown>,
    CustomVisualizationSettings
  >;
};

export type BaseWidgetProps<TValue, CustomVisualizationSettings> = {
  id: string;
  value: TValue | undefined;
  onChange: (value?: TValue | null) => void;
  onChangeSettings: (settings: Partial<CustomVisualizationSettings>) => void;
};

// TODO: infer TProps for built-in widgets
type VisualizationSettingDefinitionBase<
  T,
  TValue,
  CustomVisualizationSettings,
> = {
  id: string;
  section?: string;
  title?: string;
  group?: string;
  index?: number;
  inline?: boolean;

  default?: TValue;
  persistDefault?: boolean;
  set?: boolean;
  value?: TValue;

  readDependencies?: string[];
  writeDependencies?: string[];
  eraseDependencies?: string[];

  isValid?: (object: T, settings: CustomVisualizationSettings) => boolean;
  getDefault?: (object: T, settings: CustomVisualizationSettings) => TValue;
  getValue?: (object: T, settings: CustomVisualizationSettings) => TValue;
};

type VisualizationSettingDefinitionWithBuiltInWidget<
  T,
  TValue,
  CustomVisualizationSettings,
> = {
  [Key in WidgetName]: VisualizationSettingDefinitionBase<
    T,
    TValue,
    CustomVisualizationSettings
  > & {
    widget: Key;
    getProps?: (
      object: T,
      vizSettings: CustomVisualizationSettings,
    ) => Widgets[Key];
  };
}[WidgetName];

type VisualizationSettingDefinitionWithCustomWidget<
  T,
  TValue,
  TProps,
  CustomVisualizationSettings,
> = VisualizationSettingDefinitionBase<
  T,
  TValue,
  CustomVisualizationSettings
> & {
  widget: ComponentType<
    TProps & BaseWidgetProps<TValue, CustomVisualizationSettings>
  >;
  getProps?: (object: T, vizSettings: CustomVisualizationSettings) => TProps;
};

type VisualizationSettingDefinitionWithoutWidget<
  T,
  TValue,
  CustomVisualizationSettings,
> = VisualizationSettingDefinitionBase<
  T,
  TValue,
  CustomVisualizationSettings
> & {
  widget?: never;
  getProps?: never;
};

export type VisualizationSettingDefinition<
  T,
  TValue,
  TProps,
  CustomVisualizationSettings,
> =
  | VisualizationSettingDefinitionWithBuiltInWidget<
      T,
      TValue,
      CustomVisualizationSettings
    >
  | VisualizationSettingDefinitionWithCustomWidget<
      T,
      TValue,
      TProps,
      CustomVisualizationSettings
    >
  | VisualizationSettingDefinitionWithoutWidget<
      T,
      TValue,
      CustomVisualizationSettings
    >;

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

  onClick: (
    clickObject: ClickObject<CustomVisualizationSettings> | null,
  ) => void;

  // onHoverChange: (hoverObject?: HoveredObject | null) => void;
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

export type CustomVisualizationSettingsProps = {};

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
