import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { onUpdateDashCardVisualizationSettings } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import { uuid } from "metabase/lib/uuid";
import { PLUGIN_TABLE_ACTIONS } from "metabase/plugins";
import { Checkbox, Stack, Text } from "metabase/ui";
import type {
  DashboardCard,
  EditableTableBuiltInActionDisplaySettings,
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

export const ConfigureDashcardBuiltInTableActions = ({
  dashcard,
}: {
  dashcard: DashboardCard;
}) => {
  const dispatch = useDispatch();

  const { enabledActions, builtInActionsMap } = useMemo(() => {
    const enabledActions =
      dashcard.visualization_settings?.["editableTable.enabledActions"] ?? [];

    const builtInActionsMap = new Map<
      EditableTableBuiltInActionDisplaySettings["actionId"],
      EditableTableBuiltInActionDisplaySettings
    >();

    enabledActions.forEach((tableActionSettings) => {
      if (
        PLUGIN_TABLE_ACTIONS.isBuiltInEditableTableAction(tableActionSettings)
      ) {
        builtInActionsMap.set(
          tableActionSettings.actionId,
          tableActionSettings,
        );
      }
    });

    return { enabledActions, builtInActionsMap };
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

  return (
    <Stack gap="sm">
      <Text size="lg" fw={700}>{t`Permissions`}</Text>
      <Text
        c="text-secondary"
        lh={1.4}
      >{t`Configure what default actions end users will be able to do when viewing this dashcard.`}</Text>
      <Stack gap="sm" mt="sm">
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
  );
};
