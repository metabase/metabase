import type { StackProps } from "metabase/ui";
import type {
  ComputedVisualizationSettings,
  Widget,
} from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";
import type { QueryBuilderUIControls } from "metabase-types/store";

import type { UseChartSettingsStateReturned } from "../hooks";
import type { CommonChartSettingsProps } from "../types";

export type BaseChartSettingsProps = {
  initial?: QueryBuilderUIControls["initialChartSetting"];
  computedSettings?: ComputedVisualizationSettings;
  question?: Question;
  widgets: Widget[];
} & CommonChartSettingsProps &
  Pick<UseChartSettingsStateReturned, "chartSettings" | "transformedSeries"> &
  StackProps;
