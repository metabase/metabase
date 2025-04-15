import { useCallback, useMemo } from "react";

import { useListActionsQuery } from "metabase/api";
import { onUpdateDashCardVisualizationSettings } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import { Checkbox, Loader, Stack } from "metabase/ui";
import type {
  DashboardCard,
  WritebackImplicitQueryAction,
} from "metabase-types/api";

const SUPPORTED_IMPLICIT_ACTIONS = ["row/create", "row/delete"];

export const ConfigureEditableTableActions = ({
  dashcard,
}: {
  dashcard: DashboardCard;
}) => {
  const dispatch = useDispatch();

  const enabledActions =
    dashcard.card.visualization_settings?.["editableTable.enabledActions"] ??
    [];

  const { data: actions, isLoading } = useListActionsQuery({
    "model-id": dashcard.card.id,
  });

  const implicitActions = useMemo(() => {
    return (
      actions?.filter(
        (action) =>
          action.type === "implicit" &&
          SUPPORTED_IMPLICIT_ACTIONS.includes(action.kind),
      ) ?? ([] as WritebackImplicitQueryAction[])
    );
  }, [actions]);

  const handleToggleAction = useCallback(
    ({ id, enabled }: { id: number; enabled: boolean }) => {
      const enabledActions =
        dashcard.card.visualization_settings?.[
          "editableTable.enabledActions"
        ] ?? implicitActions.map(({ id }) => ({ id, enabled: true }));

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
    [
      dashcard.card.visualization_settings,
      dashcard.id,
      dispatch,
      implicitActions,
    ],
  );

  if (isLoading) {
    return <Loader />;
  }

  return (
    <Stack>
      {implicitActions?.map(({ name, id }) => {
        const isEnabled = enabledActions.length
          ? enabledActions.find(({ id: itemId }) => itemId === id)?.enabled
          : true; // default to enabled if no actions are set

        return (
          <Checkbox
            key={name}
            label={name}
            checked={isEnabled}
            onChange={() => handleToggleAction({ id, enabled: !isEnabled })}
          />
        );
      })}
    </Stack>
  );
};
