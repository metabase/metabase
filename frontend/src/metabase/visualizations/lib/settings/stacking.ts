import { VisualizationSettings } from "metabase-types/api";

export const getStackOffset = (settings: VisualizationSettings) => {
  if (settings["stackable.stack_type"] == null) {
    return null;
  }

  return settings["stackable.stack_type"] === "stacked" ? "none" : "expand";
};
