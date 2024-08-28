import { t } from "ttag";
import _ from "underscore";

import type { VisualizationProps } from "metabase/visualizations/types";

export const Heatmap = (_props: VisualizationProps) => {
  return <div>Heatmap 🎉</div>;
};

Object.assign(Heatmap, {
  uiName: t`Heatmap`,
  identifier: "Heatmap",
  iconName: "grid",
  noun: t`Heatmap`,
});
