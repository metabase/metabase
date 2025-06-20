import { useCallback } from "react";
import { t } from "ttag";

import { uuid } from "metabase/lib/uuid";
import { Button, Modal, Stack, Text } from "metabase/ui";
import type { BasicTableViewColumn } from "metabase/visualizations/types/table-actions";
import type {
  RowActionFieldSettings,
  TableAction,
  TableActionDisplaySettings,
  WritebackAction,
} from "metabase-types/api";

import { AddOrEditActionSettingsContent } from "../AddOrEditActionSettingsContent";

import { RowActionItem } from "./RowActionItem";
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
        enabled: true,
      };

      if (name && name !== action.name) {
        newItem.name = name;
      }

      const newArray = tableActions ? [...tableActions, newItem] : [newItem];

      onChange(newArray);
    },
    [onChange, tableActions],
  );

  const updateAction = useCallback(
    (action: TableActionDisplaySettings) => {
      if (!tableActions) {
        return;
      }

      const newArray = tableActions.map((tableAction) => {
        return tableAction.id !== action.id ? tableAction : action;
      });

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
        enabled: editingAction?.enabled ?? true,
      };

      if (name && name !== action.name) {
        newItem.name = name;
      }

      updateAction(newItem);
    },
    [updateAction, editingAction],
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
    <Stack gap="sm">
      <Text fw={700}>{t`Connected actions`}</Text>
      <Stack gap="sm" mb="lg">
        {tableActions?.length ? (
          tableActions?.map((action) => {
            return (
              <RowActionItem
                key={action.id}
                action={action}
                onRemove={handleRemoveAction}
                onEdit={setEditingAction}
                onEnable={updateAction}
              />
            );
          })
        ) : (
          <Text>{t`Create, connect, pass data around`}</Text>
        )}
      </Stack>

      <Button
        variant="active"
        onClick={openEditingModal}
      >{t`Add new connected action`}</Button>

      {isEditingModalOpen && (
        <Modal.Root
          opened
          onClose={cancelEditAction}
          data-testid="table-action-settings-modal"
          h="100vh"
          w="100vw"
          closeOnEscape={false}
          yOffset="10dvh"
        >
          <Modal.Overlay />
          <AddOrEditActionSettingsContent
            action={editingAction}
            tableColumns={columns}
            onSubmit={editingAction ? handleEditAction : handleAddAction}
            onClose={cancelEditAction}
          />
        </Modal.Root>
      )}
    </Stack>
  );
};
