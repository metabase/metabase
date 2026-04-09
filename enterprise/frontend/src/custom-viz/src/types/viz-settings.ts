import type { ComponentType, ReactNode } from "react";

import type { Column, Series } from "./data";
import type { BaseWidgetProps, ClickBehavior } from "./viz";

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
  Record<string, unknown>
> extends keyof P
  ? Omit<P, keyof BaseWidgetProps<unknown, Record<string, unknown>>>
  : P;

type PropsFromWidget<W> = W extends WidgetName
  ? Widgets[W]
  : W extends ComponentType<infer P>
    ? OmitBaseWidgetProps<P>
    : never;

type CommonVisualizationSettings = {
  "card.title"?: string | undefined | null;
  "card.description"?: string | undefined | null;
  "card.hide_empty"?: boolean | undefined | null;
  click_behavior?: ClickBehavior | undefined;
};

export type CustomVisualizationSettings<
  TSettings extends Record<string, unknown>,
> = TSettings & CommonVisualizationSettings;

export type CreateDefineSetting<TSettings extends Record<string, unknown>> =
  () => <
    W extends WidgetName | ComponentType<any>,
    Key extends keyof TSettings,
  >(settingDefinition: {
    /**
     * Unique key that identifies this setting. Must match the key used in your
     * `CustomVisualizationSettings` type and in the `settings` map passed to
     * `createCustomVisualization`.
     */
    id: Key;

    /**
     * Top-level section that this setting appears under in the settings sidebar
     * (e.g. `"Data"`, `"Display"`, `"Axes"`).
     */
    section?: string;

    /** Human-readable label rendered above the widget in the sidebar. */
    title?: string;

    /**
     * Sub-heading within a `section` used to cluster related settings
     * visually (e.g. `"X-axis"`, `"Y-axis"`). Settings sharing the same
     * `group` within a section are rendered under a common sub-heading.
     */
    group?: string;

    /**
     * Controls the display order of settings when they're placed in the same group.
     */
    index?: number;

    /**
     * When `true`, the widget is rendered on the same line as its `title`
     * label rather than below it. Best suited for compact widgets like
     * `"toggle"`.
     */
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

    /**
     * Widget to render for this setting: either a built-in widget name (`WidgetName`)
     * or a custom React component (`React.ComponentType<P>`).
     *
     * When using a custom component, `getProps` should return only the non-base props;
     * base widget props are provided by the settings renderer.
     */
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
     * @param series - The current query result (rows + column metadata).
     * @param settings - All settings resolved so far, respecting `readDependencies` ordering.
     * @returns `true` to keep the stored value, `false` to fall back to`getDefault`.
     */
    isValid?: (
      series: Series,
      settings: CustomVisualizationSettings<TSettings>,
    ) => boolean;

    /**
     * Computes the default value for this setting when no stored value exists,
     * or when `isValid` returns `false` for the stored value.
     *
     * Called during the settings resolution pass before the visualization renders.
     * The returned value is used transiently unless `persistDefault` is `true`,
     * in which case it is written into the card's stored `visualization_settings`
     * on the first query run.
     *
     * @param series - The current query result (rows + column metadata).
     * @param settings - All settings resolved so far, respecting `readDependencies` ordering.
     * @returns The default value for this setting.
     */
    getDefault?: (
      series: Series,
      settings: CustomVisualizationSettings<TSettings>,
    ) => TSettings[Key];

    /**
     * Returns additional props passed to the setting's `widget` component,
     * beyond the base props the engine always provides.
     *
     * Called on every render. Use it to derive widget configuration from the
     * current query result or resolved settings — for example, populating a
     * dropdown's `options` list from the available columns.
     *
     * The return type is inferred from the `widget` value: props of the named
     * built-in widget when `widget` is a `WidgetName`, or the component's own
     * props (minus the base props the engine injects) when `widget` is a custom
     * React component. Omit `getProps` entirely when the widget has no
     * configurable props (`ToggleProps` is `never`).
     *
     * @param series - The current query result (rows + column metadata).
     * @param vizSettings - All settings resolved so far, respecting `readDependencies` ordering.
     * @returns Props object merged into the widget component's props.
     */
    getProps?: PropsFromWidget<W> extends never
      ? never
      : (
          series: Series,
          vizSettings: CustomVisualizationSettings<TSettings>,
        ) => PropsFromWidget<W>;

    /**
     * Computes a derived value for this setting on every render, overriding both
     * the stored value and the result of `getDefault`.
     *
     * Use this when the setting's effective value must always be derived from the
     * current query result or other resolved settings, and storing a user-chosen
     * value makes no sense. Unlike `getDefault`, `getValue` is always called —
     * the stored value is never used.
     *
     * @param series - The current query result (rows + column metadata).
     * @param settings - All settings resolved so far, respecting `readDependencies` ordering.
     * @returns The computed value for this setting.
     *
     * @example
     * // Always reflect the number of series currently in the result
     * getValue: (series, _settings) => series.length,
     */
    getValue?: (
      series: Series,
      settings: CustomVisualizationSettings<TSettings>,
    ) => TSettings[Key];
  }) => CustomVisualizationSettingDefinition<TSettings>;

declare const SettingDefinitionSymbol: unique symbol;

export type CustomVisualizationSettingDefinition<_CustomVisualizationSettings> =
  {
    readonly [SettingDefinitionSymbol]: never;
  };
