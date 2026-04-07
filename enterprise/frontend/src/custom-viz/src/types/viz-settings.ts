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
  /** Unique key that identifies this setting. Must match the key used in your
   *  `CustomVisualizationSettings` type and in the `settings` map passed to
   *  `createCustomVisualization`. */
  id: Key;

  /** Top-level tab that this setting appears under in the settings sidebar
   *  (e.g. `"Data"`, `"Display"`, `"Axes"`). Settings with the same
   *  `section` value are grouped under the same tab. Omit to place the
   *  setting outside of any section. */
  section?: string;

  /** Human-readable label rendered above the widget in the sidebar. */
  title?: string;

  /** Sub-heading within a `section` used to cluster related settings
   *  visually (e.g. `"X-axis"`, `"Y-axis"`). Settings sharing the same
   *  `group` within a section are rendered under a common sub-heading. */
  group?: string;

  /** Controls the display order of settings within a section/group.
   *  Lower numbers appear first. Settings without an `index` are ordered
   *  by declaration order as a fallback. */
  index?: number;

  /** When `true`, the widget is rendered on the same line as its `title`
   *  label rather than below it. Best suited for compact widgets like
   *  `"toggle"`. */
  inline?: boolean;

  /**
   * When `true`, the computed default value (from `getDefault`) is written
   * into the card's stored `visualization_settings` the first time the query
   * runs, even though the user never explicitly changed the setting.
   *
   * Use this for settings whose default depends on the query result and must
   * survive subsequent renders without re-running `getDefault`. For example,
   * auto-selected axis columns are persisted so that manually
   * reordering series does not lose the original
   * auto-selection when the question is saved and reopened.
   *
   * Without `persistDefault`, `getDefault` re-runs on every render and any
   * derived state (e.g. user-applied series order) built on top of the
   * default can be silently reset when data or column order changes.
   */
  persistDefault?: boolean;

  /**
   * Setting IDs that must be computed before this setting.
   *
   * The settings engine resolves each listed ID first so their values are
   * available in the `settings` argument passed to `getDefault`, `getValue`,
   * `isValid`, and `getProps`. Required because computed settings are memoized —
   * without an explicit ordering a dependency may still be `undefined` when
   * this setting tries to read it.
   */
  readDependencies?: string[];
  /**
   * Setting IDs whose current computed values are persisted alongside this
   * setting whenever it changes.
   *
   * On change, the engine snapshots each listed setting's current computed
   * value into the write payload. Use this to "lock in" dynamic defaults of
   * related settings so they aren't silently recalculated under the new
   * context and lose user intent.
   */
  writeDependencies?: string[];
  /**
   * Setting IDs that are reset to `null` whenever this setting changes.
   *
   * On change, each listed setting is set to `null` in the persisted payload,
   * forcing it to recompute from scratch on the next render. Use this to
   * invalidate derived settings whose stored value becomes stale or meaningless
   * after the change.
   */
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
