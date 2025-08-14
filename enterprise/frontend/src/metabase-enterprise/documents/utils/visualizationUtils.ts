import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";
import { getSensibleVisualizations } from "metabase/query_builder/components/chart-type-selector/use-question-visualization-state";
import type { IconName } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type { CardDisplayType, Dataset } from "metabase-types/api";

export interface VisualizationItem {
  value: CardDisplayType;
  label: string;
  iconName: IconName | null;
}

/**
 * Converts a visualization type to a visualization item with label and icon
 */
export function getVisualizationItem(
  visualizationType: CardDisplayType,
): VisualizationItem | null {
  const visualization = visualizations.get(visualizationType);
  if (!visualization) {
    return null;
  }

  return {
    value: visualizationType,
    label: visualization.getUiName(),
    iconName: visualization.iconName,
  };
}

/**
 * Hook that provides visualization items and selected element
 * based on the dataset and current display type.
 */
export function useVisualizationOptions(
  dataset: Dataset | null | undefined,
  currentDisplay?: CardDisplayType,
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
