import { useCallback, useMemo, useState } from "react";

import { ActionSettingsWrapper } from "metabase/actions/components/ActionViz/ActionDashcardSettings.styled";
import { skipToken } from "metabase/api";
import type { ActionItem } from "metabase/common/components/DataPicker";
import { Modal } from "metabase/ui";
import type { BasicTableViewColumn } from "metabase/visualizations/types/table-actions";
import { useGetActionsQuery } from "metabase-enterprise/api";
import type {
  DataGridWritebackAction,
  RowActionFieldSettings,
  TableActionDisplaySettings,
} from "metabase-types/api";

import { TableOrModelDataPicker } from "../TableOrModelDataPicker";

import { ActionParameterMappingForm } from "./ActionParameterMappingForm";

interface Props {
  action: TableActionDisplaySettings | null | undefined;
  tableColumns: BasicTableViewColumn[];
  onClose: () => void;
  onSubmit: (actionParams: {
    id?: string;
    action: DataGridWritebackAction;
    name: string | undefined;
    parameterMappings: RowActionFieldSettings[];
  }) => void;
  actions?: DataGridWritebackAction[];
}

export function AddOrEditActionSettingsContent({
  action: editedActionSettings,
  tableColumns,
  onClose,
  onSubmit,
}: Props) {
  const [selectedPickerAction, setSelectedPickerAction] = useState<
    ActionItem | undefined
  >(
    editedActionSettings
      ? {
          id: editedActionSettings.actionId,
          name: editedActionSettings.name,
          model: "action",
        }
      : undefined,
  );

  const isEditMode = !!editedActionSettings;

  // TODO: replace this block with action describe api.
  const { data: allActions } = useGetActionsQuery(
    selectedPickerAction || editedActionSettings ? undefined : skipToken,
  );
  const selectedAction = useMemo(() => {
    if (editedActionSettings) {
      return allActions?.find(
        (action) => action.id === editedActionSettings.actionId,
      );
    }

    if (selectedPickerAction) {
      return allActions?.find(
        (action) => action.id === selectedPickerAction.id,
      );
    }
  }, [allActions, editedActionSettings, selectedPickerAction]);

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

  if (!isEditMode) {
    return (
      <TableOrModelDataPicker
        value={selectedPickerAction}
        onChange={setSelectedPickerAction}
        onClose={onClose}
      >
        {selectedAction && (
          <ActionParameterMappingForm
            action={selectedAction}
            actionSettings={editedActionSettings}
            tableColumns={tableColumns}
            onSubmit={handleSubmit}
          />
        )}
      </TableOrModelDataPicker>
    );
  }

  return (
    <Modal.Content>
      <ActionSettingsWrapper
        style={{
          padding: 0,
          height: "78vh",
          minWidth: "auto",
        }}
      >
        {selectedAction && (
          <ActionParameterMappingForm
            action={selectedAction}
            actionSettings={editedActionSettings}
            tableColumns={tableColumns}
            onSubmit={handleSubmit}
          />
        )}
      </ActionSettingsWrapper>
    </Modal.Content>
  );
}
