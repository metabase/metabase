import { useMemo } from "react";

import { useListActionsQuery } from "metabase/api";
import type {
  DashCardVisualizationSettings,
  EditableTableRowActionId,
  VisualizationSettings,
} from "metabase-types/api";

export const useTableActions = ({
  cardId,
  visualizationSettings,
}: {
  cardId: number;
  visualizationSettings?: VisualizationSettings & DashCardVisualizationSettings;
}) => {
  const { data: actions } = useListActionsQuery({
    "model-id": cardId,
  });

  return useMemo(() => {
    const enabledActionsSet =
      visualizationSettings?.["editableTable.enabledActions"]?.reduce(
        (result, item) => {
          if (item.enabled) {
            result.add(item.id);
          }

          return result;
        },
        new Set<EditableTableRowActionId>(),
      ) || new Set<EditableTableRowActionId>();

    const hasCreateAction = enabledActionsSet.has("row/create");

    const hasDeleteAction = enabledActionsSet.has("row/delete");

    const enabledRowActions =
      actions?.filter(({ id }) => enabledActionsSet.has(id)) || [];

    return {
      hasCreateAction,
      hasDeleteAction,
      enabledRowActions,
    };
  }, [actions, visualizationSettings]);
};
