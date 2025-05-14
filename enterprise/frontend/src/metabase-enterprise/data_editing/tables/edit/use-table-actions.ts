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

  const {
    hasCreateAction,
    hasDeleteAction,
    enabledRowActions,
    enabledActionsVizSettingsSet,
  } = useMemo(() => {
    const enabledActionsVizSettingsSet = new Map<
      EditableTableRowActionId,
      EditableTableRowActionDisplaySettings
    >();

    visualizationSettings?.["editableTable.enabledActions"]?.forEach(
      (action) => {
        if (action.enabled) {
          enabledActionsVizSettingsSet.set(action.id, action);
        }
      },
    );

    const hasCreateAction = enabledActionsVizSettingsSet.has("row/create");
    const hasDeleteAction = enabledActionsVizSettingsSet.has("row/delete");

    const enabledRowActions =
      actions
        ?.filter(({ id }) => enabledActionsVizSettingsSet.has(id))
        .map((action) => {
          const actionSettings = enabledActionsVizSettingsSet.get(action.id);

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
      enabledActionsVizSettingsSet,
    };
  }, [actions, visualizationSettings]);

  const handleRowActionRun = useCallback(
    (action: WritebackAction, row: Row<RowValues>) => {
      if (!datasetData) {
        console.warn("Failed to trigger action, datasetData is null");
        return;
      }

      const rowIndex = row.index;
      const rowData = datasetData.rows[rowIndex];

      const vizSettings = enabledActionsVizSettingsSet.get(action.id);

      const remappedInitialActionValues = action.parameters?.reduce(
        (result, parameter) => {
          if (parameter.id) {
            const mappingSettings = vizSettings?.parameterMappings?.find(
              ({ parameterId }) => parameterId === parameter.id,
            );

            if (mappingSettings) {
              if (mappingSettings.sourceType === "row-data") {
                const targetColumnIndex = datasetData?.cols.findIndex((col) => {
                  return col.id === mappingSettings.sourceValueTarget;
                });

                if (targetColumnIndex > -1) {
                  result[parameter.id] = rowData[targetColumnIndex];
                }
              }

              if (mappingSettings.sourceType === "constant") {
                result[parameter.id] = mappingSettings.value;
              }
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
    [datasetData, enabledActionsVizSettingsSet],
  );

  const handleExecuteModalClose = useCallback(() => {
    setActiveActionState(null);
  }, []);

  return {
    hasCreateAction,
    hasDeleteAction,
    enabledRowActions,
    handleRowActionRun,
    activeActionState,
    handleExecuteModalClose,
  };
};
