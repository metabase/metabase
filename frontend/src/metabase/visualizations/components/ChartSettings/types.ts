import type { ComponentType } from "react";

import type {
  VisualizationSettingDefinition,
  WidgetComponentDef,
} from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import type { Series, VisualizationSettings } from "metabase-types/api";

// this type is not full, we need to extend it later
export type Widget<
  K extends keyof VisualizationSettings = keyof VisualizationSettings,
  SettingsWidget extends ComponentType<any> = ComponentType<any>,
> = {
  id: K;
  value: VisualizationSettings[K];
  section: string;
  title: string;
  hidden?: boolean;
  marginBottom?: string;
  disabled?: boolean;
  set?: boolean;
  onChange: (value: VisualizationSettings[K], question: Question) => void;
  onChangeSettings: (
    settings: VisualizationSettings,
    question: Question,
  ) => void;
} & Omit<
  VisualizationSettingDefinition<K>,
  | "id"
  | "value"
  | "section"
  | "title"
  | "hidden"
  | "marginBottom"
  | "disabled"
  | "props"
  | "set"
  | "widget"
> &
  (SettingsWidget extends ComponentType<infer P>
    ? WidgetComponentDef<SettingsWidget, P, VisualizationSettings[K]>
    : never);

export type CommonChartSettingsProps = {
  series: Series;
  onChange?: (settings: VisualizationSettings, question?: Question) => void;
};

// Only used for the tests in ChartSettings.unit.spec.tsx
export type BaseChartSettingsTestProps = {
  widgets?: Widget[];
};
