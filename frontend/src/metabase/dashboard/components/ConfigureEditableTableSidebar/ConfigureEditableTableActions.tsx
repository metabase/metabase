import { useCallback } from "react";
import { t } from "ttag";

import { useListActionsQuery } from "metabase/api";
import { onUpdateDashCardVisualizationSettings } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import { Checkbox, Stack, Text } from "metabase/ui";
import type {
  DashboardCard,
  EditableTableRowActionDisplaySetting,
} from "metabase-types/api";

const DEFAULT_ACTIONS = [
  {
    id: "row/create" as const,
    label: t`Create a new record`,
  },
  {
    id: "row/delete" as const,
    label: t`Delete a record`,
  },
];

export const ConfigureEditableTableActions = ({
  dashcard,
}: {
  dashcard: DashboardCard;
}) => {
  const dispatch = useDispatch();

  const enabledActions =
    dashcard.visualization_settings?.["editableTable.enabledActions"] ?? [];

  const { data: actions } = useListActionsQuery({
    "model-id": dashcard.card.id,
  });

  const handleToggleAction = useCallback(
    ({ id, enabled }: EditableTableRowActionDisplaySetting) => {
      const enabledActions =
        dashcard.visualization_settings?.["editableTable.enabledActions"] || [];

      const newArray = [...enabledActions];

      const actionIndex = enabledActions.findIndex(
        (action) => action.id === id,
      );

      if (actionIndex > -1) {
        newArray[actionIndex] = {
          ...enabledActions[actionIndex],
          enabled,
        };
      } else {
        newArray.push({
          id,
          enabled,
        });
      }

      dispatch(
        onUpdateDashCardVisualizationSettings(dashcard.id, {
          "editableTable.enabledActions": newArray,
        }),
      );
    },
    [dashcard.visualization_settings, dashcard.id, dispatch],
  );

  return (
    <Stack>
      <Text>{t`Default actions`}</Text>
      {DEFAULT_ACTIONS?.map(({ id, label }) => {
        const isEnabled =
          enabledActions.find(({ id: itemId }) => itemId === id)?.enabled ||
          false;

        return (
          <Checkbox
            key={id}
            label={label}
            checked={isEnabled}
            onChange={() => handleToggleAction({ id, enabled: !isEnabled })}
          />
        );
      })}

      {!!actions?.length && (
        <>
          <Text>{t`Row actions`}</Text>
          {actions.map(({ id, name }) => {
            const isEnabled =
              enabledActions.find(({ id: itemId }) => itemId === id)?.enabled ||
              false;

            return (
              <Checkbox
                key={id}
                label={name}
                checked={isEnabled}
                onChange={() => handleToggleAction({ id, enabled: !isEnabled })}
              />
            );
          })}
        </>
      )}
    </Stack>
  );
};
