import { useCallback } from "react";
import { t } from "ttag";

import { uuid } from "metabase/lib/uuid";
import { Button, Modal, Stack } from "metabase/ui";
import type { BasicTableViewColumn } from "metabase/visualizations/types/table-actions";
import type {
  RowActionFieldSettings,
  TableAction,
  TableActionDisplaySettings,
  WritebackAction,
} from "metabase-types/api";

import { RowActionItem } from "./RowActionItem";
import { RowActionSettingsModalContent } from "./RowActionSettingsModalContent";
import { useTableActionsEditingModal } from "./use-table-actions-editing-modal";

type ConfigureTableActionsProps = {
  value: TableActionDisplaySettings[] | undefined;
  cols: BasicTableViewColumn[];
  onChange: (newValue: TableActionDisplaySettings[]) => void;
};

export const ConfigureTableActions = ({
  value: tableActions,
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

  const handleAddAction = useCallback(
    ({
      action,
      name,
      parameterMappings,
    }: {
      action: WritebackAction | TableAction;
      name: string | undefined;
      parameterMappings: RowActionFieldSettings[];
    }) => {
      const newItem: TableActionDisplaySettings = {
        id: uuid(),
        name: name || action.name,
        actionId: action.id,
        actionType: "data-grid/row-action",
        parameterMappings,
      };

      if (name && name !== action.name) {
        newItem.name = name;
      }

      const newArray = tableActions ? [...tableActions, newItem] : [newItem];

      onChange(newArray);
    },
    [onChange, tableActions],
  );

  const handleEditAction = useCallback(
    ({
      id,
      action,
      name,
      parameterMappings,
    }: {
      id?: string;
      action: WritebackAction | TableAction;
      name: string | undefined;
      parameterMappings: RowActionFieldSettings[];
    }) => {
      const newItem: TableActionDisplaySettings = {
        id: id || uuid(),
        name: name || action.name,
        actionId: action.id,
        actionType: "data-grid/row-action",
        parameterMappings,
      };

      if (name && name !== action.name) {
        newItem.name = name;
      }

      const newArray = (tableActions || []).map((action) => {
        return action.actionId !== newItem.actionId ? action : newItem;
      });

      onChange(newArray);
    },
    [onChange, tableActions],
  );

  const handleRemoveAction = useCallback(
    (idToRemove: TableActionDisplaySettings["id"]) => {
      const newArray = (tableActions || []).filter(
        ({ id }) => id !== idToRemove,
      );

      onChange(newArray);
    },
    [onChange, tableActions],
  );

  return (
    <>
      <Stack gap="xs">
        {tableActions?.map((action) => {
          return (
            <RowActionItem
              key={action.id}
              action={action}
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
          tableColumns={columns}
          onSubmit={editingAction ? handleEditAction : handleAddAction}
          onClose={cancelEditAction}
        />
      </Modal>
    </>
  );
};
