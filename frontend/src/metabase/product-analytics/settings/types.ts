import type { ComponentType } from "react";

/**
 * Typed authoring layer over viz-core's settings engine. Callback shapes and
 * argument order match `VisualizationSettingDefinition`, with the context in
 * place of the series.
 */

export type SettingSection = "toolbar" | "setup" | "advanced" | "filters";

export type SettingGroup = "columns";

export type SettingKey<S> = keyof S & string;

/**
 * What the user changed, as persisted in the URL and saved cards. Untrusted
 * until the engine validates it; see `isValid`.
 */
export type StoredSettings = Record<string, unknown>;

export type SettingWidgetProps<V> = {
  id: string;
  value: V;
  onChange: (value: V) => void;
};

/**
 * `P` is what `getProps` returns. The widget receives it alongside
 * `SettingWidgetProps`, so a component may require it; such definitions go
 * through `withWidgetProps` to fit in `SettingDefinitions`.
 */
export type SettingDefinition<
  TContext,
  S,
  K extends SettingKey<S>,
  P extends object = object,
> = {
  getTitle?: (context: TContext, settings: S) => string;
  /** Shown in a tooltip on an info icon next to the title. */
  getHint?: () => string;
  group?: SettingGroup;
  /** Renders the title and widget on one line. */
  inline?: boolean;
  /** Renders below a divider, after the section's other settings. */
  secondary?: boolean;
  getSection: () => SettingSection;
  /** A widget registry name (see `registerSettingWidgets`) or a component. */
  widget?: string | ComponentType<SettingWidgetProps<S[K]> & P>;
  /** May only read the keys in `readDependencies`, which are computed first. */
  getDefault: (context: TContext, settings: Partial<S>) => S[K];
  /**
   * Checks a stored value, which comes from the URL or a saved card and so is
   * `unknown`. Invalid values fall back to the default. Like `getDefault`, it
   * may only read `readDependencies` from `settings`.
   */
  isValid: (value: unknown, context: TContext, settings: Partial<S>) => boolean;
  getHidden?: (context: TContext, settings: S) => boolean;
  getProps?: (
    context: TContext,
    settings: S,
    onChange: (value: S[K]) => void,
  ) => P;
  readDependencies?: SettingKey<S>[];
  writeDependencies?: SettingKey<S>[];
  eraseDependencies?: SettingKey<S>[];
};

export type SettingDefinitions<TContext, S> = {
  [K in SettingKey<S>]: SettingDefinition<TContext, S, K>;
};

/** A setting ready to render. Values are untyped here, as in viz-core. */
export type SettingWidget = {
  id: string;
  section: SettingSection;
  group?: SettingGroup;
  inline?: boolean;
  secondary?: boolean;
  title?: string;
  hint?: string;
  hidden: boolean;
  value: unknown;
  props: Record<string, unknown>;
  widget: ComponentType<Record<string, unknown> & { id: string }>;
  onChange: (value: unknown) => void;
};
