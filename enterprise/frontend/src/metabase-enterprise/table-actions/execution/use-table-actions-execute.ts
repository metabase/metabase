import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

import { skipToken } from "metabase/api";
import type { SelectedTableActionState } from "metabase/visualizations/types/table-actions";
import { useGetActionsQuery } from "metabase-enterprise/api";
import type {
  ActionFormInitialValues,
  DataGridWritebackAction,
  DatasetData,
  RowValues,
  TableActionDisplaySettings,
  TableRowActionDisplaySettings,
} from "metabase-types/api";

import {
  isBuiltInEditableTableAction,
  remapRowActionMappingsToActionOverride,
} from "../settings/AddOrEditActionSettingsContent/utils";

export const useTableActionsExecute = ({
  actionsVizSettings,
  datasetData,
}: {
  actionsVizSettings: TableActionDisplaySettings[] | undefined;
  datasetData: DatasetData | null | undefined;
}) => {
  const [selectedTableActionState, setSelectedTableActionState] =
    useState<SelectedTableActionState | null>(null);

  const hasAddedActions = actionsVizSettings && actionsVizSettings.length > 0;

  const { data: actions } = useGetActionsQuery(
    hasAddedActions ? null : skipToken,
  );

  const { tableActions, tableActionsVizSettingsSet } = useMemo(() => {
    const tableActionsVizSettingsSet = new Map<
      TableRowActionDisplaySettings["actionId"],
      TableRowActionDisplaySettings
    >();

    actionsVizSettings?.forEach((action) => {
      if (!isBuiltInEditableTableAction(action)) {
        tableActionsVizSettingsSet.set(action.actionId, action);
      }
    });

    const tableActions =
      actions
        ?.filter(({ id }) => tableActionsVizSettingsSet.has(id))
        .map((action) => {
          const actionSettings = tableActionsVizSettingsSet.get(action.id);

          // remap to user defined custom action name
          return {
            ...action,
            name: actionSettings?.name || action.name,
          };
        }) || [];

    return {
      tableActions,
      tableActionsVizSettingsSet,
    };
  }, [actions, actionsVizSettings]);

  const handleTableActionRun = useCallback(
    (action: DataGridWritebackAction, row: Row<RowValues>) => {
      if (!datasetData) {
        console.warn("Failed to trigger action, datasetData is null");
        return;
      }

      const rowIndex = row.index;
      const rowData = datasetData.rows[rowIndex];

      const actionVizSettings = tableActionsVizSettingsSet.get(action.id);

      const remappedInitialActionValues = action.parameters?.reduce(
        (result, parameter) => {
          if (parameter.id) {
            const mappingSettings = actionVizSettings?.parameterMappings?.find(
              ({ parameterId }) => parameterId === parameter.id,
            );

            if (mappingSettings) {
              if (mappingSettings.sourceType === "row-data") {
                const targetColumnIndex = datasetData?.cols.findIndex((col) => {
                  if (mappingSettings.sourceValueTarget) {
                    return col.name === mappingSettings.sourceValueTarget;
                  }
                  return false;
                });

                if (targetColumnIndex > -1) {
                  result[parameter.id] = rowData[targetColumnIndex];
                } else {
                  console.warn(
                    "Failed to apply column mapping for table action",
                    { action, actionMappingSettings: actionVizSettings },
                  );
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

      const actionOverrides = actionVizSettings
        ? remapRowActionMappingsToActionOverride(actionVizSettings)
        : undefined;

      setSelectedTableActionState({
        actionId: action.id,
        rowData: remappedInitialActionValues || {},
        actionOverrides,
      });
    },
    [datasetData, tableActionsVizSettingsSet],
  );

  const handleExecuteActionModalClose = useCallback(() => {
    setSelectedTableActionState(null);
  }, []);

  return {
    tableActions,
    handleTableActionRun,
    selectedTableActionState,
    handleExecuteActionModalClose,
  };
};
