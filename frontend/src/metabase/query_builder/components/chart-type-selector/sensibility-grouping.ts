import visualizations from "metabase/visualizations";
import type { VisualizationSensibility } from "metabase/visualizations/types";
import type { CardDisplayType, DatasetData } from "metabase-types/api";

export type { VisualizationSensibility } from "metabase/visualizations/types";

const MAX_RECOMMENDED = 12;

export type SensibilityGroups = Record<
  VisualizationSensibility,
  CardDisplayType[]
>;

export function groupVisualizationsBySensibility({
  orderedVizTypes,
  data,
}: {
  orderedVizTypes: CardDisplayType[];
  data: DatasetData;
}): SensibilityGroups {
  const groups: SensibilityGroups = {
    recommended: [],
    sensible: [],
    nonsensible: [],
  };

  for (const vizType of orderedVizTypes) {
    const viz = visualizations.get(vizType);
    const sensibility = viz?.getSensibility?.(data) ?? "nonsensible";
    groups[sensibility].push(vizType);
  }

  while (groups.recommended.length > MAX_RECOMMENDED) {
    const overflow = groups.recommended.pop()!;
    groups.sensible.unshift(overflow);
  }

  return groups;
}
