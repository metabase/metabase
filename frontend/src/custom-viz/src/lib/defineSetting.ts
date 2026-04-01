import type {
  BaseWidgetProps,
  CustomVisualizationSettingDefinition,
  Series,
  WidgetName,
  Widgets,
} from "../types";

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

export function defineSetting<
  CustomVisualizationSettings extends Record<string, unknown>,
  TValue,
  W extends WidgetName | ((props: any) => any),
>(settingDefinition: {
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

  widget: W;

  isValid?: (series: Series, settings: CustomVisualizationSettings) => boolean;
  getDefault?: (
    series: Series,
    settings: CustomVisualizationSettings,
  ) => TValue;
  getProps?: PropsFromWidget<W> extends never
    ? never
    : (
        object: Series,
        vizSettings: CustomVisualizationSettings,
      ) => PropsFromWidget<W>;
  getValue?: (series: Series, settings: CustomVisualizationSettings) => TValue;
}): CustomVisualizationSettingDefinition<CustomVisualizationSettings> {
  return settingDefinition as unknown as CustomVisualizationSettingDefinition<CustomVisualizationSettings>;
}
