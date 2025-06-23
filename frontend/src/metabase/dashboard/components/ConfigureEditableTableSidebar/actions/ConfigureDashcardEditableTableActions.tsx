import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { onUpdateDashCardVisualizationSettings } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import { uuid } from "metabase/lib/uuid";
import { PLUGIN_TABLE_ACTIONS } from "metabase/plugins";
import { Checkbox, Stack, Text } from "metabase/ui";
import type {
  Dashboard,
  DashboardCard,
  EditableTableBuiltInActionDisplaySettings,
  TableActionDisplaySettings,
  TableRowActionDisplaySettings,
} from "metabase-types/api";

const DEFAULT_ACTIONS = [
  {
    actionId: "data-grid.row/create" as const,
    get label() {
      return t`Create new records`;
    },
  },
  {
    actionId: "data-grid.row/update" as const,
    get label() {
      return t`Update records`;
    },
  },
  {
    actionId: "data-grid.row/delete" as const,
    get label() {
      return t`Delete records`;
    },
  },
];

export const ConfigureDashcardEditableTableActions = ({
  dashboard,
  dashcard,
}: {
  dashboard: Dashboard;
  dashcard: DashboardCard;
}) => {
  const dispatch = useDispatch();

  const databaseId = dashcard.card?.database_id;

  const { enabledActions, tableActions, builtInActionsMap } = useMemo(() => {
    const enabledActions =
      dashcard.visualization_settings?.["editableTable.enabledActions"] ?? [];

    const builtInActionsMap = new Map<
      EditableTableBuiltInActionDisplaySettings["actionId"],
      EditableTableBuiltInActionDisplaySettings
    >();

    const tableActions: TableRowActionDisplaySettings[] = [];

    enabledActions.forEach((tableActionSettings) => {
      if (
        PLUGIN_TABLE_ACTIONS.isBuiltInEditableTableAction(tableActionSettings)
      ) {
        builtInActionsMap.set(
          tableActionSettings.actionId,
          tableActionSettings,
        );
      } else {
        tableActions.push(tableActionSettings as TableRowActionDisplaySettings);
      }
    });

    return { enabledActions, tableActions, builtInActionsMap };
  }, [dashcard.visualization_settings]);

  const tableColumns = useMemo(() => {
    const fieldsWithRemmapedColumns = dashcard.card.result_metadata ?? [];
    const fields = fieldsWithRemmapedColumns.filter((field) => {
      if ("remapped_from" in field) {
        return !field.remapped_from;
      }
      return true;
    });

    return fields;
  }, [dashcard.card.result_metadata]);

  const editableColumns = useMemo(() => {
    return dashcard.visualization_settings?.["table.editableColumns"] ?? [];
  }, [dashcard.visualization_settings]);

  const handleToggleBuiltInAction = useCallback(
    ({
      actionId,
      enabled,
    }: Pick<
      EditableTableBuiltInActionDisplaySettings,
      "actionId" | "enabled"
    >) => {
      const newArray = [...enabledActions];

      const actionIndex = enabledActions.findIndex(
        (action) => action.actionId === actionId,
      );

      if (actionIndex > -1) {
        newArray[actionIndex] = {
          ...enabledActions[actionIndex],
          enabled,
        } as EditableTableBuiltInActionDisplaySettings;
      } else {
        // Temporary solution to enable 'Update' default action on existing dashcards without DB migration.
        if (DEFAULT_ACTIONS.find((action) => action.actionId === actionId)) {
          newArray.push({
            id: uuid(),
            actionId,
            enabled,
            actionType: "data-grid/built-in",
          });
        }
      }

      dispatch(
        onUpdateDashCardVisualizationSettings(dashcard.id, {
          "editableTable.enabledActions": newArray,
          // Special case to enable/disable editing for all columns when 'Update records' is toggled.
          ...(actionId === "data-grid.row/update"
            ? {
                "table.editableColumns": enabled
                  ? tableColumns.map((field) => field.name)
                  : [],
              }
            : {}),
        }),
      );
    },
    [enabledActions, dispatch, dashcard.id, tableColumns],
  );

  const handleUpdateRowActions = useCallback(
    (newActions: TableActionDisplaySettings[]) => {
      const builtIns = enabledActions.filter(
        PLUGIN_TABLE_ACTIONS.isBuiltInEditableTableAction,
      );

      dispatch(
        onUpdateDashCardVisualizationSettings(dashcard.id, {
          "editableTable.enabledActions": [...builtIns, ...newActions],
        }),
      );
    },
    [dashcard.id, dispatch, enabledActions],
  );

  const ConfigureTableActions = PLUGIN_TABLE_ACTIONS.ConfigureTableActions;

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Text fw={700}>{t`Default actions`}</Text>
        <Stack gap="sm">
          {DEFAULT_ACTIONS.map(({ actionId, label }) => {
            const isEnabled = builtInActionsMap.get(actionId)?.enabled || false;
            const isIndeterminate =
              actionId === "data-grid.row/update" &&
              !isEnabled &&
              editableColumns.length > 0;

            return (
              <Checkbox
                key={actionId}
                label={label}
                indeterminate={isIndeterminate}
                checked={isIndeterminate || isEnabled}
                onChange={() =>
                  handleToggleBuiltInAction({ actionId, enabled: !isEnabled })
                }
              />
            );
          })}
        </Stack>
      </Stack>

      {dashboard && (
        <ConfigureTableActions
          value={tableActions}
          onChange={handleUpdateRowActions}
          databaseId={databaseId}
          cols={tableColumns}
        />
      )}
    </Stack>
  );
};
