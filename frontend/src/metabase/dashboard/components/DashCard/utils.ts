import { getVirtualCardType } from "metabase/dashboard/utils";
import type {
  BaseDashboardCard,
  Series,
  VisualizerColumnValueSource,
  VisualizerDataSourceId,
  VisualizerVizDefinition,
} from "metabase-types/api";

const VIZ_WITH_CUSTOM_MAPPING_UI = ["heading", "placeholder"];

export function shouldShowParameterMapper({
  dashcard,
  isEditingParameter,
}: {
  dashcard: BaseDashboardCard;
  isEditingParameter?: boolean;
}) {
  const display = getVirtualCardType(dashcard);
  return (
    isEditingParameter &&
    !(display && VIZ_WITH_CUSTOM_MAPPING_UI.includes(display))
  );
}

export function getMissingColumnsFromVisualizationSettings(options: {
  visualizerEntity: VisualizerVizDefinition | undefined;
  rawSeries: Series;
}) {
  const { visualizerEntity, rawSeries } = options;

  if (!visualizerEntity || !rawSeries?.length) {
    return [];
  }

  const { columnValuesMapping } = visualizerEntity;

  const colsForCards: Record<VisualizerDataSourceId, Set<string>> = {};
  rawSeries.forEach((series) => {
    const cardId: VisualizerDataSourceId = `card:${series.card.id}`;
    if (!colsForCards[cardId]) {
      colsForCards[cardId] = new Set();
    }
    series.data?.cols.forEach((col) => {
      colsForCards[cardId].add(col.name);
    });
  });

  const missingCols: VisualizerColumnValueSource[][] = [];
  Object.entries(columnValuesMapping).forEach(([_columnRef, columns]) => {
    const missing = columns.filter((column) => {
      if (typeof column === "string") {
        return false; // This is a data source name reference, not a column
      }

      return (
        !colsForCards[column.sourceId] ||
        !colsForCards[column.sourceId].has(column.originalName)
      );
    });

    if (missing.length > 0) {
      missingCols.push(missing);
    }
  });

  return missingCols;
}
