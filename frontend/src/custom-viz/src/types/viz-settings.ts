import type { ReactNode } from "react";

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
  : W extends (props: infer P) => any
    ? OmitBaseWidgetProps<P>
    : never;

export type CreateDefineSetting<
  CustomVisualizationSettings extends Record<string, unknown>,
> = () => <
  W extends WidgetName | ((props: any) => any),
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
