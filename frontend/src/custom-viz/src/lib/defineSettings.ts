import type {
  CustomVisualizationSettingsDefinitions,
  Series,
  WidgetName,
  Widgets,
} from "../types";

type PropsFromWidget<W> = W extends WidgetName
  ? Widgets[W]
  : W extends (props: infer P) => any
    ? P
    : never;

export function defineSettings<
  CustomVisualizationSettings extends Record<string, unknown>,
  TValue,
  W extends Record<string, WidgetName | ((props: any) => any)>,
>(settings: {
  [K in keyof W]: {
    id: string;
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

    widget: W[K];

    isValid?: (
      series: Series,
      settings: CustomVisualizationSettings,
    ) => boolean;
    getDefault?: (
      series: Series,
      settings: CustomVisualizationSettings,
    ) => TValue;
    getProps(
      object: Series,
      vizSettings: CustomVisualizationSettings,
    ): PropsFromWidget<W[K]>;
    getValue?: (
      series: Series,
      settings: CustomVisualizationSettings,
    ) => TValue;
  };
}): CustomVisualizationSettingsDefinitions<CustomVisualizationSettings> {
  return settings;
}
