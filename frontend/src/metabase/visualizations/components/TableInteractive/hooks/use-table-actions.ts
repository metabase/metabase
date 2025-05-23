import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

import { skipToken, useListActionsQuery } from "metabase/api";
import { remapRowActionMappingsToActionOverride } from "metabase-enterprise/data_editing/tables/edit/actions/utils";
import type { TableActionsExecuteFormVizOverride } from "metabase-enterprise/data_editing/tables/types";
import type {
  ActionFormInitialValues,
  DatasetData,
  RowValues,
  TableActionDisplaySettings,
  TableActionId,
  WritebackAction,
  WritebackActionId,
} from "metabase-types/api";

export const useTableActions = ({
  actionsVizSettings,
  datasetData,
}: {
  actionsVizSettings: TableActionDisplaySettings[] | undefined;
  datasetData: DatasetData | null | undefined;
}) => {
  const [selectedTableActionState, setSelectedTableActionState] = useState<{
    actionId: WritebackActionId;
    rowData: ActionFormInitialValues;
    actionOverrides?: TableActionsExecuteFormVizOverride;
  } | null>(null);

  const hasAddedActions = actionsVizSettings && actionsVizSettings.length > 0;

  const { data: actions } = useListActionsQuery(
    hasAddedActions ? {} : skipToken,
  );

  const { tableActions, tableActionsVizSettingsSet } = useMemo(() => {
    const tableActionsVizSettingsSet = new Map<
      TableActionId,
      TableActionDisplaySettings
    >();

    actionsVizSettings?.forEach((action) => {
      tableActionsVizSettingsSet.set(action.id, action);
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
    (action: WritebackAction, row: Row<RowValues>) => {
      if (!datasetData) {
        console.warn("Failed to trigger action, datasetData is null");
        return;
      }

      const rowIndex = row.index;
      const rowData = datasetData.rows[rowIndex];

      const vizSettings = tableActionsVizSettingsSet.get(action.id);

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

      const actionOverrides = vizSettings
        ? remapRowActionMappingsToActionOverride(vizSettings)
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
