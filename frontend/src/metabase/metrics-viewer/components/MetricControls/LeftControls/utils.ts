import { t } from "ttag";

import type {
  MetricsViewerDimensionBreakoutType,
  MetricsViewerDisplayType,
} from "metabase/metrics-viewer/types";
import { getDimensionBreakoutConfig } from "metabase/metrics-viewer/utils";

export { LeftControls } from "./LeftControls";

export function isValidDisplayTypeForDimensionBreakout(
  displayType: MetricsViewerDisplayType,
  dimensionBreakoutType: MetricsViewerDimensionBreakoutType,
): boolean {
  const config = getDimensionBreakoutConfig(dimensionBreakoutType);
  return config.availableDisplayTypes.some((t) => t.type === displayType);
}

export function getDisplayTypeLabel(type: MetricsViewerDisplayType) {
  switch (type) {
    case "line":
      return t`Line chart`;
    case "area":
      return t`Area chart`;
    case "bar":
      return t`Bar chart`;
    case "map":
      return t`Map`;
    case "scatter":
      return t`Scatter plot`;
    case "scalar":
      return t`Scalar`;
    default:
      return type;
  }
}
