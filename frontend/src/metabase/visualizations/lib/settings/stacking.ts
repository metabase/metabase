import type { StackOffset } from "metabase/visualizations/shared/components/RowChart/types";
import type { VisualizationSettings } from "metabase-types/api";

export const getStackOffset = (
  settings: VisualizationSettings,
): StackOffset => {
  if (settings["stackable.stack_type"] == null) {
    return null;
  }

  return settings["stackable.stack_type"] === "stacked"
    ? "diverging"
    : "expand";
};
