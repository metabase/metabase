import type { VisualizationSettings } from "metabase-types/api";
import type { StackOffset } from "metabase/visualizations/shared/components/RowChart/types";

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
