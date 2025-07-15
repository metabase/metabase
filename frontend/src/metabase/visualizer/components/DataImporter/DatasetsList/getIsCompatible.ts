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
    // filtering out fields that are not DatasetColumn because
    // `groupColumnsBySuitableVizSettings` expects DatasetColumn[]
    // yet we receive Field[] from the API
    // (see https://metaboat.slack.com/archives/C064QMXEV9N/p1752511191286999)
    fields.filter((field) => "source" in field) as DatasetColumn[],
  );

  return Object.keys(columnSettingMapping).length > 0;
}
