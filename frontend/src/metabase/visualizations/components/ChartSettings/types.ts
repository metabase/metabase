import type Question from "metabase-lib/v1/Question";
import type { Series, VisualizationSettings } from "metabase-types/api";

// this type is not full, we need to extend it later
export type Widget = {
  id: string;
  section: string;
  hidden?: boolean;
  props: Record<string, unknown>;
  title?: string;
  widget: (() => JSX.Element | null) | undefined;
};

export type CommonChartSettingsProps = {
  series: Series;
  onChange?: (settings: VisualizationSettings, question?: Question) => void;
};

// Only used for the tests in ChartSettings.unit.spec.tsx
export type BaseChartSettingsTestProps = {
  widgets?: Widget[];
};
