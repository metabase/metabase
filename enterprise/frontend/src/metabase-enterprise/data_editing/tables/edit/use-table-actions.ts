import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

import { useListActionsQuery } from "metabase/api";
import type {
  ActionFormInitialValues,
  DashCardVisualizationSettings,
  DatasetData,
  EditableTableRowActionDisplaySettings,
  EditableTableRowActionId,
  RowValues,
  VisualizationSettings,
  WritebackAction,
  WritebackActionId,
} from "metabase-types/api";

const DISABLED_AUTOMATIC_MAPPING_IDS = ["id", "created_at", "updated_at"];

export const useTableActions = ({
  visualizationSettings,
  datasetData,
}: {
  visualizationSettings?: VisualizationSettings & DashCardVisualizationSettings;
  datasetData: DatasetData | null | undefined;
}) => {
  const [activeActionState, setActiveActionState] = useState<{
    actionId: WritebackActionId;
    rowData: ActionFormInitialValues;
  } | null>(null);

  const { data: actions } = useListActionsQuery({});

  const handleRowActionRun = useCallback(
    (action: WritebackAction, row: Row<RowValues>) => {
      if (!datasetData) {
        console.warn("Failed to trigger action, datasetData is null");
        return;
      }

      const rowIndex = row.index;
      const rowData = datasetData.rows[rowIndex];

      const remappedInitialActionValues = action.parameters?.reduce(
        (result, parameter) => {
          if (
            parameter.slug &&
            parameter.id &&
            !DISABLED_AUTOMATIC_MAPPING_IDS.includes(
              parameter.slug.toLowerCase(),
            )
          ) {
            const targetColumnIndex = datasetData?.cols.findIndex((col) => {
              return col.name.toLowerCase() === parameter.slug.toLowerCase();
            });

            if (targetColumnIndex > -1) {
              result[parameter.id] = rowData[targetColumnIndex];
            }
          }

          return result;
        },
        {} as ActionFormInitialValues,
      );

      setActiveActionState({
        actionId: action.id,
        rowData: remappedInitialActionValues || {},
      });
    },
    [datasetData],
  );

  const handleExecuteModalClose = useCallback(() => {
    setActiveActionState(null);
  }, []);

  const { hasCreateAction, hasDeleteAction, enabledRowActions } =
    useMemo(() => {
      const enabledActionsSet = new Map<
        EditableTableRowActionId,
        EditableTableRowActionDisplaySettings
      >();

      visualizationSettings?.["editableTable.enabledActions"]?.forEach(
        (action) => {
          if (action.enabled) {
            enabledActionsSet.set(action.id, action);
          }
        },
      );

      const hasCreateAction = enabledActionsSet.has("row/create");
      const hasDeleteAction = enabledActionsSet.has("row/delete");

      const enabledRowActions =
        actions
          ?.filter(({ id }) => enabledActionsSet.has(id))
          .map((action) => {
            const actionSettings = enabledActionsSet.get(action.id);

            // remap to user defined custom action name
            return {
              ...action,
              name: actionSettings?.name || action.name,
            };
          }) || [];

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
    activeActionState,
    handleExecuteModalClose,
  };
};
