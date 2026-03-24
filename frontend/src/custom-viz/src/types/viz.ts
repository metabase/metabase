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
  minSize?: VisualizationGridSize;

  /**
   * Default size on dashboard grid.
   */
  defaultSize?: VisualizationGridSize;

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
  StaticVisualizationComponent?: ComponentType<
    CustomStaticVisualizationProps<CustomVisualizationSettings>
  >;
};

export type CustomVisualizationSettingsDefinitions<
  CustomVisualizationSettings,
  K extends keyof CustomVisualizationSettings =
    keyof CustomVisualizationSettings,
> = {
  [Key in K]-?: VisualizationSettingDefinition<
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

type VisualizationSettingDefinitionBase<TValue, CustomVisualizationSettings> = {
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

  isValid?: (series: Series, settings: CustomVisualizationSettings) => boolean;
  getDefault?: (
    series: Series,
    settings: CustomVisualizationSettings,
  ) => TValue;
  getValue?: (series: Series, settings: CustomVisualizationSettings) => TValue;
};

type VisualizationSettingDefinitionWithBuiltInWidget<
  TValue,
  CustomVisualizationSettings,
> = {
  [Key in WidgetName]: VisualizationSettingDefinitionBase<
    TValue,
    CustomVisualizationSettings
  > & {
    widget: Key;
    getProps?: (
      object: Series,
      vizSettings: CustomVisualizationSettings,
    ) => Widgets[Key];
  };
}[WidgetName];

type VisualizationSettingDefinitionWithCustomWidget<
  TValue,
  TProps,
  CustomVisualizationSettings,
> = VisualizationSettingDefinitionBase<TValue, CustomVisualizationSettings> & {
  widget: ComponentType<
    TProps & BaseWidgetProps<TValue, CustomVisualizationSettings>
  >;
  getProps?: (
    object: Series,
    vizSettings: CustomVisualizationSettings,
  ) => TProps;
};

type VisualizationSettingDefinitionWithoutWidget<
  TValue,
  CustomVisualizationSettings,
> = VisualizationSettingDefinitionBase<TValue, CustomVisualizationSettings> & {
  widget?: never;
  getProps?: never;
};

export type VisualizationSettingDefinition<
  TValue,
  TProps,
  CustomVisualizationSettings,
> =
  | VisualizationSettingDefinitionWithBuiltInWidget<
      TValue,
      CustomVisualizationSettings
    >
  | VisualizationSettingDefinitionWithCustomWidget<
      TValue,
      TProps,
      CustomVisualizationSettings
    >
  | VisualizationSettingDefinitionWithoutWidget<
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
