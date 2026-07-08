import { useMemo } from "react";

import { isNotNull } from "metabase/utils/types";
import visualizations from "metabase/visualizations";
import { getSensibleVisualizations } from "metabase/visualizations/lib/sensibility";
import type {
  Dataset,
  IconName,
  VisualizationDisplay,
} from "metabase-types/api";

export interface VisualizationItem {
  value: VisualizationDisplay;
  label: string;
  iconName: IconName | null;
  iconUrl?: string;
}

/**
 * Converts a visualization type to a visualization item with label and icon
 */
export function getVisualizationItem(
  visualizationType: VisualizationDisplay,
): VisualizationItem | null {
  const visualization = visualizations.get(visualizationType);
  if (!visualization) {
    return null;
  }

  return {
    value: visualizationType,
    label: visualization.getUiName(),
    iconName: visualization.iconName,
    iconUrl: visualization.iconUrl,
  };
}

/**
 * Hook that provides visualization items and selected element
 * based on the dataset and current display type.
 */
export function useVisualizationOptions(
  dataset: Dataset | null | undefined,
  currentDisplay?: VisualizationDisplay,
) {
  const { sensibleVisualizations, nonSensibleVisualizations } = useMemo(() => {
    return getSensibleVisualizations({ result: dataset ?? null });
  }, [dataset]);

  const sensibleItems = useMemo(
    () => sensibleVisualizations.map(getVisualizationItem).filter(isNotNull),
    [sensibleVisualizations],
  );

  const nonsensibleItems = useMemo(
    () => nonSensibleVisualizations.map(getVisualizationItem).filter(isNotNull),
    [nonSensibleVisualizations],
  );

  const selectedElem = useMemo(
    () =>
      getVisualizationItem(currentDisplay ?? "table") ??
      sensibleItems[0] ??
      nonsensibleItems[0],
    [currentDisplay, sensibleItems, nonsensibleItems],
  );

  return {
    sensibleItems,
    nonsensibleItems,
    selectedElem,
  };
}
