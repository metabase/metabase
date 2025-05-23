import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { onUpdateDashCardVisualizationSettings } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_TABLE_ACTIONS } from "metabase/plugins";
import { Checkbox, Stack } from "metabase/ui";
import type {
  Dashboard,
  DashboardCard,
  EditableTableBuiltInActionDisplaySettings,
  TableActionDisplaySettings,
  TableRowActionDisplaySettings,
} from "metabase-types/api";

const DEFAULT_ACTIONS = [
  {
    id: "data-grid.row/create" as const,
    get label() {
      return t`Create a new record`;
    },
  },
  {
    id: "data-grid.row/delete" as const,
    get label() {
      return t`Delete a record`;
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

  const { enabledActions, tableActions, builtInActionsMap } = useMemo(() => {
    const enabledActions =
      dashcard.visualization_settings?.["editableTable.enabledActions"] ?? [];

    const builtInActionsMap = new Map<
      EditableTableBuiltInActionDisplaySettings["id"],
      EditableTableBuiltInActionDisplaySettings
    >();

    const tableActions: TableRowActionDisplaySettings[] = [];

    enabledActions.forEach((tableActionSettings) => {
      if (
        PLUGIN_TABLE_ACTIONS.isBuiltInEditableTableAction(tableActionSettings)
      ) {
        const typed =
          tableActionSettings as EditableTableBuiltInActionDisplaySettings;
        builtInActionsMap.set(typed.id, typed);
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

  const handleToggleAction = useCallback(
    ({
      id,
      enabled,
    }: Pick<EditableTableBuiltInActionDisplaySettings, "id" | "enabled">) => {
      const newArray = [...enabledActions];

      const actionIndex = enabledActions.findIndex(
        (action) => action.id === id,
      );

      if (actionIndex > -1) {
        newArray[actionIndex] = {
          ...enabledActions[actionIndex],
          enabled,
        } as EditableTableBuiltInActionDisplaySettings;
      } else {
        newArray.push({
          id,
          enabled,
          actionType: "data-grid/built-in",
        });
      }

      dispatch(
        onUpdateDashCardVisualizationSettings(dashcard.id, {
          "editableTable.enabledActions": newArray,
        }),
      );
    },
    [enabledActions, dispatch, dashcard.id],
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
    <>
      <Stack gap="xs">
        {DEFAULT_ACTIONS.map(({ id, label }) => {
          const isEnabled = builtInActionsMap.get(id)?.enabled || false;

          return (
            <Checkbox
              key={id}
              label={label}
              checked={isEnabled}
              onChange={() => handleToggleAction({ id, enabled: !isEnabled })}
            />
          );
        })}
      </Stack>

      {dashboard && (
        <ConfigureTableActions
          value={tableActions}
          onChange={handleUpdateRowActions}
          cols={tableColumns}
        />
      )}
    </>
  );
};
