import type {
  DashCardVisualizationSettings,
  VisualizationSettings,
} from "metabase-types/api";

export const useTableActions = (
  visualizationSettings?: VisualizationSettings & DashCardVisualizationSettings,
) => {
  const hasCreateAction =
    visualizationSettings?.["editableTable.enabledActions"]?.find(
      ({ id }) => id === "row/create",
    )?.enabled || false;

  const hasDeleteAction =
    visualizationSettings?.["editableTable.enabledActions"]?.find(
      ({ id }) => id === "row/delete",
    )?.enabled || false;

  return {
    hasCreateAction,
    hasDeleteAction,
  };
};
