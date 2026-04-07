import type { ComponentType, ReactNode } from "react";

import type { Column, Series } from "./data";
import type { BaseWidgetProps } from "./viz";

export type WidgetName = keyof Widgets;

export type Widgets = {
  input: InputProps;
  number: NumberProps;
  radio: RadioProps;
  select: SelectProps;
  toggle: ToggleProps;
  segmentedControl: SegmentedControlProps;
  field: FieldProps;
  fields: FieldsProps;
  color: ColorProps;
  multiselect: MultiselectProps;
};

export type InputProps = {
  placeholder?: string;
};

export type NumberProps = {
  options?: {
    isInteger?: boolean;
    isNonNegative?: boolean;
  };
  placeholder?: string;
};

export type RadioProps = {
  options: {
    name: string;
    value: boolean | string | null;
  }[];
};

export type SelectProps = {
  options: {
    name: string;
    value: boolean | string | null;
  }[];
  placeholder?: string;
  placeholderNoOptions?: string;
};

export type ToggleProps = never;

export type SegmentedControlProps = {
  options: {
    name: string;
    value: string;
  }[];
};

export type FieldProps = {
  columns: Column[];
  options: {
    name: string;
    value: string;
  }[];
  showColumnSetting?: boolean;
};

export type FieldsProps = {
  addAnother?: ReactNode;
  columns: Column[];
  options: {
    name: string;
    value: string;
  }[];
  showColumnSetting?: boolean;
  showColumnSettingForIndicies?: number[];
};

export type ColorProps = {
  title?: string;
};

export type MultiselectProps = {
  options: {
    label: string;
    value: string;
  }[];
  placeholder?: string;
  placeholderNoOptions?: string;
};

type OmitBaseWidgetProps<P> = keyof BaseWidgetProps<
  unknown,
  unknown
> extends keyof P
  ? Omit<P, keyof BaseWidgetProps<unknown, unknown>>
  : P;

type PropsFromWidget<W> = W extends WidgetName
  ? Widgets[W]
  : W extends ComponentType<infer P>
    ? OmitBaseWidgetProps<P>
    : never;

export type CreateDefineSetting<
  CustomVisualizationSettings extends Record<string, unknown>,
> = () => <
  W extends WidgetName | ComponentType<any>,
  Key extends keyof CustomVisualizationSettings,
>(settingDefinition: {
  id: Key;
  section?: string;
  title?: string;
  group?: string;
  index?: number;
  inline?: boolean;

  persistDefault?: boolean;
  set?: boolean;

  readDependencies?: string[];
  writeDependencies?: string[];
  eraseDependencies?: string[];

  widget: W;

  /**
   * Determines whether the stored value for this setting is still valid given
   * the current data and resolved settings. Called during the settings
   * resolution pass before the visualization renders.
   *
   * When `isValid` returns `false`, the stored value is discarded and
   * `getDefault` is used instead. This keeps settings coherent when the
   * underlying query changes — for example, when a saved column reference no
   * longer exists in the result set.
   *
   * @param series  - The current query result (rows + column metadata).
   * @param settings - All settings resolved so far, respecting
   *   `readDependencies` ordering.
   * @returns `true` to keep the stored value, `false` to fall back to
   *   `getDefault`.
   *
   * @example
   * // Invalidate a saved column name when it no longer exists in the data
   * isValid: (series, settings) =>
   *   series[0].data.cols.some(col => col.name === settings.xColumn),
   */
  isValid?: (series: Series, settings: CustomVisualizationSettings) => boolean;
  getDefault?: (
    series: Series,
    settings: CustomVisualizationSettings,
  ) => CustomVisualizationSettings[Key];
  getProps?: PropsFromWidget<W> extends never
    ? never
    : (
        object: Series,
        vizSettings: CustomVisualizationSettings,
      ) => PropsFromWidget<W>;
  getValue?: (
    series: Series,
    settings: CustomVisualizationSettings,
  ) => CustomVisualizationSettings[Key];
}) => CustomVisualizationSettingDefinition<CustomVisualizationSettings>;

declare const SettingDefinitionSymbol: unique symbol;

export type CustomVisualizationSettingDefinition<_CustomVisualizationSettings> =
  {
    readonly [SettingDefinitionSymbol]: never;
  };
