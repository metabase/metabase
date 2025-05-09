import { useDisclosure } from "@mantine/hooks";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { useListActionsQuery } from "metabase/api";
import Modal from "metabase/components/Modal";
import { onUpdateDashCardVisualizationSettings } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import { Button, Checkbox, Stack } from "metabase/ui";
import type {
  Dashboard,
  DashboardCard,
  EditableTableRowActionDisplaySetting,
  EditableTableRowActionId,
  WritebackAction,
} from "metabase-types/api";

import { RowActionItem } from "./RowActionItem";
import { RowActionSettingsModalContent } from "./RowActionSettingsModalContent";

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
  dashboard,
  dashcard,
}: {
  dashboard: Dashboard;
  dashcard: DashboardCard;
}) => {
  const [isOpen, { close, open }] = useDisclosure(false);
  const [editingAction, setEditingAction] = useState<WritebackAction | null>(
    null,
  );
  const dispatch = useDispatch();

  const { enabledActions, enabledActionsMap } = useMemo(() => {
    const enabledActions =
      dashcard.visualization_settings?.["editableTable.enabledActions"] ?? [];

    const enabledActionsMap = enabledActions.reduce((result, item) => {
      result.set(item.id, item);
      return result;
    }, new Map<EditableTableRowActionId, EditableTableRowActionDisplaySetting>());

    return { enabledActions, enabledActionsMap };
  }, [dashcard.visualization_settings]);

  const { data: actions } = useListActionsQuery({}); // TODO: we should have an api to optimize this

  const addedRowActions =
    actions?.filter(({ id }) => enabledActionsMap.get(id)) || [];

  const handleToggleAction = useCallback(
    ({ id, enabled }: EditableTableRowActionDisplaySetting) => {
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
    [enabledActions, dispatch, dashcard.id],
  );

  const handleAddAction = useCallback(
    (action: WritebackAction) => {
      const newArray = [
        ...enabledActions,
        {
          id: action.id,
          enabled: true,
        },
      ];

      dispatch(
        onUpdateDashCardVisualizationSettings(dashcard.id, {
          "editableTable.enabledActions": newArray,
        }),
      );
    },
    [dashcard.id, dispatch, enabledActions],
  );

  const handleRemoveAction = useCallback(
    (actionId: number) => {
      const newArray = enabledActions.filter(({ id }) => id !== actionId);

      dispatch(
        onUpdateDashCardVisualizationSettings(dashcard.id, {
          "editableTable.enabledActions": newArray,
        }),
      );
    },
    [dashcard.id, dispatch, enabledActions],
  );

  const handleEditAction = useCallback(
    (action: WritebackAction) => {
      setEditingAction(action);
      open();
    },
    [open],
  );

  const handleCancelEditAction = useCallback(() => {
    close();
    setEditingAction(null);
  }, [close]);

  return (
    <>
      <Stack gap="xs">
        {DEFAULT_ACTIONS.map(({ id, label }) => {
          const isEnabled = enabledActionsMap.get(id)?.enabled || false;

          return (
            <Checkbox
              key={id}
              label={label}
              checked={isEnabled}
              onChange={() => handleToggleAction({ id, enabled: !isEnabled })}
            />
          );
        })}

        {addedRowActions?.map((action) => {
          const actionSettings = enabledActionsMap.get(action.id);
          const isEnabled = actionSettings?.enabled || false;

          return (
            <RowActionItem
              key={action.id}
              action={action}
              isEnabled={isEnabled}
              onToggle={handleToggleAction}
              onRemove={handleRemoveAction}
              onEdit={handleEditAction}
            />
          );
        })}
      </Stack>

      <Button
        variant="subtle"
        p={0}
        onClick={open}
      >{t`Add a new row action`}</Button>

      {dashboard && (
        <Modal isOpen={isOpen} fit onClose={handleCancelEditAction}>
          <RowActionSettingsModalContent
            dashboard={dashboard}
            dashcard={dashcard}
            action={editingAction}
            parameterMappings={
              editingAction
                ? enabledActionsMap.get(editingAction.id)?.parameterMappings
                : undefined
            }
            onSubmit={handleAddAction}
            onClose={handleCancelEditAction}
          />
        </Modal>
      )}
    </>
  );
};
