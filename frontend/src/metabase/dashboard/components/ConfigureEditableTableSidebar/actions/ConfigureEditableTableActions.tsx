import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useListActionsQuery } from "metabase/api";
import { onUpdateDashCardVisualizationSettings } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import { Button, Checkbox, Modal, Stack } from "metabase/ui";
import type {
  Dashboard,
  DashboardCard,
  EditableTableRowActionDisplaySettings,
  EditableTableRowActionId,
  RowActionFieldSettings,
  WritebackAction,
} from "metabase-types/api";

import { RowActionItem } from "./RowActionItem";
import { RowActionSettingsModalContent } from "./RowActionSettingsModalContent";
import { useRowActionEditingModal } from "./use-row-action-editing-modal";
import { useGetActionsQuery } from "metabase-enterprise/api";

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
  const dispatch = useDispatch();

  const {
    isEditingModalOpen,
    editingAction,
    openEditingModal,
    setEditingAction,
    cancelEditAction,
  } = useRowActionEditingModal();

  const { enabledActions, enabledActionsMap } = useMemo(() => {
    const enabledActions =
      dashcard.visualization_settings?.["editableTable.enabledActions"] ?? [];
    debugger;

    const enabledActionsMap = enabledActions.reduce((result, item) => {
      result.set(item.id, item);
      return result;
    }, new Map<EditableTableRowActionId, EditableTableRowActionDisplaySettings>());

    return { enabledActions, enabledActionsMap };
  }, [dashcard.visualization_settings]);

  // const { data: actions } = useListActionsQuery({}); // TODO: we should have an api to optimize this
  const { data: actions } = useGetActionsQuery();
  const tableActions = useMemo(
    () => actions?.filter((action) => "table_id" in action),
    [actions],
  );

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

  const addedRowActions =
    actions?.filter(({ id }) => enabledActionsMap.get(id)) || [];

  console.log({ enabledActions, enabledActionsMap, addedRowActions });
  console.log({ actions });

  const editingActionSetting = editingAction
    ? enabledActionsMap.get(editingAction.id)
    : undefined;

  const handleToggleAction = useCallback(
    ({ id, enabled }: EditableTableRowActionDisplaySettings) => {
      const newArray = [...enabledActions];
      debugger;

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
    ({
      action,
      name,
      parameterMappings,
    }: {
      action: WritebackAction;
      name: string | undefined;
      parameterMappings: RowActionFieldSettings[];
    }) => {
      debugger;
      const newItem: EditableTableRowActionDisplaySettings = {
        id: action.id,
        enabled: true,
        parameterMappings,
      };

      if (name && name !== action.name) {
        newItem.name = name;
      }

      const newArray = [...enabledActions, newItem];

      dispatch(
        onUpdateDashCardVisualizationSettings(dashcard.id, {
          "editableTable.enabledActions": newArray,
        }),
      );
    },
    [dashcard.id, dispatch, enabledActions],
  );

  const handleEditAction = useCallback(
    ({
      action,
      name,
      parameterMappings,
    }: {
      action: WritebackAction;
      name: string | undefined;
      parameterMappings: RowActionFieldSettings[];
    }) => {
      const newItem: EditableTableRowActionDisplaySettings = {
        id: action.id,
        enabled: editingActionSetting?.enabled || false,
        parameterMappings,
      };

      if (name && name !== action.name) {
        newItem.name = name;
      }

      const newArray = enabledActions.map((action) => {
        return action.id !== newItem.id ? action : newItem;
      });

      dispatch(
        onUpdateDashCardVisualizationSettings(dashcard.id, {
          "editableTable.enabledActions": newArray,
        }),
      );
    },
    [dashcard.id, dispatch, editingActionSetting, enabledActions],
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

  // console.log({ addedRowActions, dashcard });

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
          const userDefinedName = actionSettings?.name;

          return (
            <RowActionItem
              key={action.id}
              action={action}
              userDefinedName={userDefinedName}
              isEnabled={isEnabled}
              onToggle={handleToggleAction}
              onRemove={handleRemoveAction}
              onEdit={setEditingAction}
            />
          );
        })}
      </Stack>

      <Button
        variant="subtle"
        p={0}
        onClick={openEditingModal}
      >{t`Add a new row action`}</Button>

      {dashboard && (
        <Modal
          size={editingAction ? undefined : "xxl"}
          opened={isEditingModalOpen}
          onClose={cancelEditAction}
        >
          <RowActionSettingsModalContent
            action={editingAction}
            rowActionSettings={editingActionSetting}
            tableColumns={tableColumns}
            tableActions={tableActions}
            onSubmit={editingAction ? handleEditAction : handleAddAction}
            onClose={cancelEditAction}
          />
        </Modal>
      )}
    </>
  );
};
