import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useListActionsQuery } from "metabase/api";
import { Button, Modal, Stack } from "metabase/ui";
import type {
  RowActionFieldSettings,
  TableActionDisplaySettings,
  TableActionId,
  WritebackAction,
} from "metabase-types/api";

import { RowActionItem } from "./RowActionItem";
import { RowActionSettingsModalContent } from "./RowActionSettingsModalContent";
import { useTableActionsEditingModal } from "./use-table-actions-editing-modal";

type ConfigureTableActionsProps = {
  value: TableActionDisplaySettings[] | undefined;
  cols: { id: number; name: string }[];
  onChange: (newValue: TableActionDisplaySettings[]) => void;
};

export const ConfigureTableActions = ({
  value: inputTableActions,
  cols: columns,
  onChange,
}: ConfigureTableActionsProps) => {
  const {
    isEditingModalOpen,
    editingAction,
    openEditingModal,
    setEditingAction,
    cancelEditAction,
  } = useTableActionsEditingModal();

  const { tableActions, tableActionsMap } = useMemo(() => {
    const tableActions = inputTableActions || [];
    const tableActionsMap = (inputTableActions || []).reduce((result, item) => {
      result.set(item.id, item);
      return result;
    }, new Map<TableActionId, TableActionDisplaySettings>());

    return { tableActions, tableActionsMap };
  }, [inputTableActions]);

  const { data: actions } = useListActionsQuery({}); // TODO: we should have an api to optimize this

  const addedTableActions =
    actions?.filter(({ id }) => tableActionsMap.get(id)) || [];

  const editingActionSetting = editingAction
    ? tableActionsMap.get(editingAction.id)
    : undefined;

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
      const newItem: TableActionDisplaySettings = {
        id: action.id,
        actionType: "data-grid/row-action",
        parameterMappings,
      };

      if (name && name !== action.name) {
        newItem.name = name;
      }

      const newArray = [...tableActions, newItem];

      onChange(newArray);
    },
    [onChange, tableActions],
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
      const newItem: TableActionDisplaySettings = {
        id: action.id,
        actionType: "data-grid/row-action",
        parameterMappings,
      };

      if (name && name !== action.name) {
        newItem.name = name;
      }

      const newArray = tableActions.map((action) => {
        return action.id !== newItem.id ? action : newItem;
      });

      onChange(newArray);
    },
    [onChange, tableActions],
  );

  const handleRemoveAction = useCallback(
    (actionId: number) => {
      const newArray = tableActions.filter(({ id }) => id !== actionId);

      onChange(newArray);
    },
    [onChange, tableActions],
  );

  return (
    <>
      <Stack gap="xs">
        {addedTableActions?.map((action) => {
          const actionSettings = tableActionsMap.get(action.id);
          const userDefinedName = actionSettings?.name;

          return (
            <RowActionItem
              key={action.id}
              action={action}
              userDefinedName={userDefinedName}
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

      <Modal
        size={editingAction ? undefined : "xxl"}
        opened={isEditingModalOpen}
        onClose={cancelEditAction}
      >
        <RowActionSettingsModalContent
          action={editingAction}
          rowActionSettings={editingActionSetting}
          tableColumns={columns}
          onSubmit={editingAction ? handleEditAction : handleAddAction}
          onClose={cancelEditAction}
        />
      </Modal>
    </>
  );
};
