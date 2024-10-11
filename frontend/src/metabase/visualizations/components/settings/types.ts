import type { VisualizationSettings } from "metabase-types/api";

export interface ChartSettingWidgetProps<TValue> {
  value: TValue | undefined;
  onChange: (value?: TValue | null) => void;
  onChangeSettings: (settings: Partial<VisualizationSettings>) => void;
}
