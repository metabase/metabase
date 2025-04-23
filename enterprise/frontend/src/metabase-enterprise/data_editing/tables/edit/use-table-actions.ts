import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";

import { executeAction } from "metabase/actions/actions";
import { useListActionsQuery } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import type {
  DashCardVisualizationSettings,
  DatasetData,
  EditableTableRowActionId,
  RowValues,
  VisualizationSettings,
  WritebackAction,
} from "metabase-types/api";

export const useTableActions = ({
  cardId,
  visualizationSettings,
  datasetData,
}: {
  cardId: number;
  visualizationSettings?: VisualizationSettings & DashCardVisualizationSettings;
  datasetData: DatasetData | null | undefined;
}) => {
  const dispatch = useDispatch();

  const { data: actions } = useListActionsQuery({
    "model-id": cardId,
  });

  const handleRowActionRun = useCallback(
    (action: WritebackAction, row: Row<RowValues>) => {
      const rowIndex = row.index;
      const data = datasetData[rowIndex];

      dispatch(
        executeAction({
          action: checkNotNull(action),
          parameters: {},
        }),
      );
    },
    [dispatch],
  );

  const { hasCreateAction, hasDeleteAction, enabledRowActions } =
    useMemo(() => {
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

  return {
    hasCreateAction,
    hasDeleteAction,
    enabledRowActions,
    handleRowActionRun,
  };
};
