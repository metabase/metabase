import type { VisualizationSettingsDefinitions } from "./visualization";

export function toVisualizationSettingsDefinitions<
  TSettings extends Record<string, unknown>,
>(settings: TSettings): VisualizationSettingsDefinitions {
  return settings as VisualizationSettingsDefinitions;
}
