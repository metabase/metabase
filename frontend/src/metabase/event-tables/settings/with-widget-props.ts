import type { ComponentType } from "react";

import type {
  SettingDefinition,
  SettingKey,
  SettingSection,
  SettingWidgetProps,
} from "./types";

/**
 * Checks that `getProps` returns the props `widget` requires beyond
 * `SettingWidgetProps`, then returns the definition in the shape
 * `SettingDefinitions` holds.
 */
export function withWidgetProps<
  TContext,
  S,
  K extends SettingKey<S>,
  P extends object,
  TSection extends string = SettingSection,
>(
  definition: SettingDefinition<TContext, S, K, P, TSection> & {
    widget: ComponentType<SettingWidgetProps<S[K]> & P>;
    getProps: NonNullable<
      SettingDefinition<TContext, S, K, P, TSection>["getProps"]
    >;
  },
): SettingDefinition<TContext, S, K, object, TSection> {
  // The engine spreads the result of `getProps` into the widget's props, so
  // the widget always gets `P`. The parameter type checks that pairing, which
  // `SettingDefinitions` cannot express per key.
  return definition as unknown as SettingDefinition<
    TContext,
    S,
    K,
    object,
    TSection
  >;
}
