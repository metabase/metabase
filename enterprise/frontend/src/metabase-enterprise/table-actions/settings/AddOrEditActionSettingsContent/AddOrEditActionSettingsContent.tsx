import { useCallback, useMemo, useState } from "react";

import { skipToken } from "metabase/api";
import type { ActionItem } from "metabase/common/components/DataPicker";
import { TableOrModelActionPicker } from "metabase/common/components/TableOrModelActionPicker";
import { Flex, Modal } from "metabase/ui";
import type { BasicTableViewColumn } from "metabase/visualizations/types/table-actions";
import { useGetActionsQuery } from "metabase-enterprise/api";
import type {
  DataGridWritebackAction,
  RowActionFieldSettings,
  TableActionDisplaySettings,
} from "metabase-types/api";

import { ActionParameterMappingForm } from "./ActionParameterMappingForm";
import S from "./AddOrEditActionSettingsContent.module.css";

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
      <TableOrModelActionPicker
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
      </TableOrModelActionPicker>
    );
  }

  return (
    <Modal.Content>
      <Flex className={S.ParametersFormWrapper}>
        {selectedAction && (
          <ActionParameterMappingForm
            action={selectedAction}
            actionSettings={editedActionSettings}
            tableColumns={tableColumns}
            onSubmit={handleSubmit}
          />
        )}
      </Flex>
    </Modal.Content>
  );
}
