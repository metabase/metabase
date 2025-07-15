import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { groupColumnsBySuitableVizSettings } from "metabase/visualizer/visualizations/compat";
import type {
  Dataset,
  DatasetColumn,
  Field,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

interface CompatibilityParameters {
  currentDataset: {
    display: VisualizationDisplay | null;
    columns: DatasetColumn[];
    settings: VisualizationSettings;
    computedSettings: ComputedVisualizationSettings;
  };
  targetDataset: {
    fields: Field[];
  };
  datasets: Record<string, Dataset>;
}

export function getIsCompatible(parameters: CompatibilityParameters) {
  const { currentDataset, targetDataset, datasets } = parameters;

  const { display: currentDisplay, computedSettings } = currentDataset;
  const { fields } = targetDataset;

  if (fields.length === 0) {
    return false;
  }

  if (currentDisplay === "pie") {
    return false;
  }

  const columnSettingMapping = groupColumnsBySuitableVizSettings(
    currentDataset,
    computedSettings,
    datasets,
    fields,
  );

  return Object.keys(columnSettingMapping).length > 0;
}
