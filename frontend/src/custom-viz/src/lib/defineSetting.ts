import type {
  CustomVisualizationSettingDefinition,
  Series,
  WidgetName,
  Widgets,
} from "../types";

type PropsFromWidget<W> = W extends WidgetName
  ? Widgets[W]
  : W extends (props: infer P) => any
    ? P
    : never;

export function createDefineSetting<
  CustomVisualizationSettings extends Record<string, unknown>,
>() {
  return function defineSetting<
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

    isValid?: (
      series: Series,
      settings: CustomVisualizationSettings,
    ) => boolean;
    getDefault?: (
      series: Series,
      settings: CustomVisualizationSettings,
    ) => CustomVisualizationSettings[Key];
    getProps(
      object: Series,
      vizSettings: CustomVisualizationSettings,
    ): PropsFromWidget<W>;
    getValue?: (
      series: Series,
      settings: CustomVisualizationSettings,
    ) => CustomVisualizationSettings[Key];
  }): CustomVisualizationSettingDefinition<CustomVisualizationSettings> {
    return settingDefinition as unknown as CustomVisualizationSettingDefinition<CustomVisualizationSettings>;
  };
}
