import type { ComponentType } from "react";

import type { CompleteSettingDefinition } from "metabase/viz-core";

import type { AnalysisContext } from "./types";

/** The props the settings engine gives every widget. */
export type AnalysisSettingWidgetProps<TValue> = {
  /** The setting's key. */
  id: string;
  value: TValue;
  onChange: (value: TValue) => void;
};

type AnalysisSettingDefinition<
  TSettings,
  K extends keyof TSettings & string,
> = CompleteSettingDefinition<AnalysisContext, TSettings, K>;

/**
 * A setting definition whose widget is a component, checking that `getProps`
 * gives the props the widget needs beyond what the engine provides.
 */
export function withWidgetProps<
  TSettings,
  K extends keyof TSettings & string,
  TProps extends object,
>(
  // Only pins `K`, which TypeScript can't infer from where the definition goes.
  _key: K,
  definition: Omit<
    AnalysisSettingDefinition<TSettings, K>,
    "widget" | "getProps"
  > & {
    widget: ComponentType<AnalysisSettingWidgetProps<TSettings[K]> & TProps>;
    getProps: (context: AnalysisContext, settings: TSettings) => TProps;
  },
): AnalysisSettingDefinition<TSettings, K> {
  // The engine spreads what `getProps` returns into the widget's props, along
  // with its own. Definitions type every widget's props as a record, so they
  // can't express that pairing; the parameter type checks it instead.
  return definition as unknown as AnalysisSettingDefinition<TSettings, K>;
}
