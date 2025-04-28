import { useCallback } from "react";
import { t } from "ttag";

import { onUpdateDashCardVisualizationSettings } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import { Checkbox, Stack } from "metabase/ui";
import type {
  DashboardCard,
  EditableTableRowActionDisplaySetting,
} from "metabase-types/api";

const DEFAULT_ACTIONS = [
  {
    id: "row/create" as const,
    get label() {
      return t`Create a new record`;
    },
  },
  {
    id: "row/delete" as const,
    get label() {
      return t`Delete a record`;
    },
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

  const handleToggleAction = useCallback(
    ({ id, enabled }: EditableTableRowActionDisplaySetting) => {
      const enabledActions =
        dashcard.visualization_settings?.["editableTable.enabledActions"] || [];

      const newArray = enabledActions.map((action) => {
        if (action.id === id) {
          return {
            ...action,
            enabled,
          };
        }
        return action;
      });

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
    </Stack>
  );
};
