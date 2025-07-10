import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { isModelAction, isTableAction } from "metabase/actions/utils";
import { skipToken } from "metabase/api";
import type {
  ActionItem,
  ModelItem,
  TableItem,
} from "metabase/common/components/DataPicker";
import { DelayedLoadingSpinner } from "metabase/common/components/EntityPicker/components/LoadingSpinner";
import { TableOrModelActionPicker } from "metabase/common/components/TableOrModelActionPicker";
import { Button, Center, Icon, Modal } from "metabase/ui";
import type { BasicTableViewColumn } from "metabase/visualizations/types/table-actions";
import { useGetActionsQuery } from "metabase-enterprise/api";
import type {
  ActionScope,
  DataGridWritebackAction,
  DatabaseId,
  RowActionFieldSettings,
  TableActionDisplaySettings,
} from "metabase-types/api";

import { ActionParameterMappingForm } from "./ActionParameterMappingForm";

interface Props {
  actionSettings: TableActionDisplaySettings | null | undefined;
  tableColumns: BasicTableViewColumn[];
  databaseId: DatabaseId | undefined;
  actionScope: ActionScope;
  onClose: () => void;
  onSubmit: (actionParams: {
    id?: string;
    action: DataGridWritebackAction;
    name: string | undefined;
    parameterMappings: RowActionFieldSettings[];
  }) => void;
}

export function AddOrEditActionSettingsContent({
  actionSettings,
  tableColumns,
  databaseId,
  onClose,
  onSubmit,
}: Props) {
  const [selectedPickerAction, setSelectedPickerAction] = useState<
    ActionItem | undefined
  >(
    actionSettings
      ? {
          id: actionSettings.actionId,
          name: actionSettings.name,
          model: "action",
        }
      : undefined,
  );

  const [newActionInitialParentItem, setNewActionInitialParentItem] = useState<
    TableItem | ModelItem | undefined
  >();

  const showNewActionStep = !!newActionInitialParentItem;

  // TODO: replace this block with action describe api.
  const {
    data: allActions,
    isLoading,
    refetch: refetchActionsList,
  } = useGetActionsQuery(selectedPickerAction ? undefined : skipToken);

  const action = useMemo(() => {
    if (selectedPickerAction) {
      const resultAction = allActions?.find(
        (action) => action.id === selectedPickerAction.id,
      );

      if (allActions && !resultAction) {
        refetchActionsList();
      }

      return resultAction;
    }
  }, [allActions, selectedPickerAction, refetchActionsList]);

  const setAction = (newActionItem: ActionItem | undefined) => {
    setSelectedPickerAction(newActionItem);
    setNewActionInitialParentItem(undefined);
  };

  const handleSubmit = useCallback(
    (actionParams: {
      id?: string;
      action: DataGridWritebackAction;
      name: string | undefined;
      parameterMappings: RowActionFieldSettings[];
    }) => {
      onSubmit(actionParams);

      onClose();
    },
    [onClose, onSubmit],
  );

  const handleChooseNewAction = useCallback(() => {
    if (!action) {
      return;
    }

    if (isModelAction(action)) {
      const parentItem: ModelItem = {
        model: "dataset",
        id: action.model_id,
        name: "",
      };
      setNewActionInitialParentItem(parentItem);
    }

    if (isTableAction(action)) {
      const parentItem: TableItem = {
        model: "table",
        id: action.table_id,
        name: "",
      };
      setNewActionInitialParentItem(parentItem);
    }
  }, [action]);

  if (isLoading) {
    return (
      <Modal.Content>
        <Center h="10rem">
          <DelayedLoadingSpinner delay={300} />
        </Center>
      </Modal.Content>
    );
  }

  if (!selectedPickerAction || !action || showNewActionStep) {
    return (
      <TableOrModelActionPicker
        value={newActionInitialParentItem}
        initialDbId={databaseId}
        onChange={setAction}
        onClose={onClose}
      />
    );
  }

  const selectedActionSettings =
    actionSettings?.actionId === selectedPickerAction?.id
      ? actionSettings
      : undefined;
  const isEditMode = !!actionSettings;

  if (isEditMode) {
    return (
      <Modal.Content>
        <ActionParameterMappingForm
          action={action}
          actionSettings={selectedActionSettings}
          tableColumns={tableColumns}
          onSubmit={handleSubmit}
        />
      </Modal.Content>
    );
  }

  return (
    <Modal.Content>
      <Modal.Header p="2rem 1.5rem 0.5rem 1.2rem">
        <Button
          leftSection={<Icon name="chevronleft" />}
          color="text-dark"
          variant="subtle"
          size="compact-md"
          onClick={handleChooseNewAction}
        >{t`Choose a new action`}</Button>
        <Modal.CloseButton />
      </Modal.Header>
      <Modal.Body p="0">
        <ActionParameterMappingForm
          action={action}
          actionSettings={selectedActionSettings}
          tableColumns={tableColumns}
          onSubmit={handleSubmit}
        />
      </Modal.Body>
    </Modal.Content>
  );
}
