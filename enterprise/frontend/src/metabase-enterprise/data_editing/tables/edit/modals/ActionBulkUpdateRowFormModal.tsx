import type { RowSelectionState } from "@tanstack/react-table";
import cx from "classnames";
import { useCallback, useEffect, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { ActionIcon, Group, Icon, Loader, Modal, rem } from "metabase/ui";
import type { RowValue } from "metabase-types/api";

import type {
  ActionFormParameter,
  DescribeActionFormResponse,
  RowCellsWithPkValue,
  UpdatedRowBulkHandlerParams,
} from "../../types";
import { ParameterActionInput } from "../inputs_v2/ParameterActionInput";

import S from "./ActionFormModal.css";
import { ActionFormModalParameter } from "./ActionFormModalParameter";
import { DeleteBulkRowConfirmationModal } from "./DeleteBulkRowConfirmationModal";

interface ActionBulkUpdateRowFormModalProps {
  opened: boolean;
  selectedRowIndices: number[];
  setRowSelection: (state: RowSelectionState) => void;
  description?: DescribeActionFormResponse;
  isDeleting?: boolean;
  onClose: () => void;
  onRowsUpdate: (data: UpdatedRowBulkHandlerParams) => Promise<boolean>;
  onRowsDelete: (rowIndices: number[]) => Promise<boolean>;
  withDelete?: boolean;
}

enum ModalState {
  Opened,
  DeleteRequested,
  Closed,
}

export function ActionBulkUpdateRowFormModal({
  opened,
  selectedRowIndices,
  setRowSelection,
  description,
  isDeleting,
  onClose,
  onRowsUpdate,
  onRowsDelete,
  withDelete = false,
}: ActionBulkUpdateRowFormModalProps) {
  // We need editing state to track null values for columns that were cleared
  const [editingState, setEditingState] = useState<RowCellsWithPkValue>({});

  // Clear editing state on modal close
  useEffect(() => {
    setEditingState({});
  }, [opened]);

  const [modalState, setModalState] = useState<ModalState>(ModalState.Closed);

  useEffect(() => {
    setModalState(opened ? ModalState.Opened : ModalState.Closed);
  }, [opened]);

  const requestDeletion = useCallback(
    () => setModalState(ModalState.DeleteRequested),
    [],
  );

  const closeDeletionModal = useCallback(
    () => setModalState(ModalState.Opened),
    [],
  );

  const handleValueUpdated = useCallback(
    (field: string, value: RowValue, forceUpdate?: boolean) => {
      // Skip update if the value is empty and the value was not changed before
      const valueWasModifiedBefore = field in editingState;
      if (!forceUpdate && !value && !valueWasModifiedBefore) {
        return;
      }

      onRowsUpdate({
        updatedData: { [field]: value },
        rowIndices: selectedRowIndices,
      });

      setEditingState((prev) => ({ ...prev, [field]: value }));
    },
    [onRowsUpdate, selectedRowIndices, editingState],
  );

  const handleDeleteConfirmation = useCallback(async () => {
    const result = await onRowsDelete(selectedRowIndices);
    if (result) {
      setRowSelection({});
      onClose();
    }
  }, [onRowsDelete, selectedRowIndices, onClose, setRowSelection]);

  if (modalState === ModalState.DeleteRequested) {
    return (
      <DeleteBulkRowConfirmationModal
        opened
        rowCount={selectedRowIndices.length}
        onClose={closeDeletionModal}
        onConfirm={handleDeleteConfirmation}
        isLoading={isDeleting}
      />
    );
  }

  return (
    <Modal.Root opened={modalState === ModalState.Opened} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header px="xl" pb="0" className={S.modalHeader}>
          <Modal.Title>
            {ngettext(
              msgid`Editing ${selectedRowIndices.length} record`,
              `Editing ${selectedRowIndices.length} records`,
              selectedRowIndices.length,
            )}
          </Modal.Title>
          <Group
            gap="xs"
            mr={rem(-5) /* aligns cross with modal right padding */}
          >
            {withDelete && (
              <ActionIcon variant="subtle" onClick={requestDeletion}>
                <Icon name="trash" />
              </ActionIcon>
            )}
            <ActionIcon variant="subtle" onClick={onClose}>
              <Icon name="close" />
            </ActionIcon>
          </Group>
        </Modal.Header>
        <Modal.Body px="xl" py="lg" className={cx(S.modalBody)}>
          {!description ? (
            <Loader />
          ) : (
            description.parameters.map((parameter) => {
              return (
                <ActionFormModalParameter
                  key={parameter.id}
                  parameter={parameter}
                >
                  <BulkUpdateRowFormInput
                    parameter={parameter}
                    isValueCleared={editingState[parameter.id] === null}
                    isValueModified={parameter.id in editingState}
                    onValueUpdated={handleValueUpdated}
                  />
                </ActionFormModalParameter>
              );
            })
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

type BulkUpdateRowFormInputProps = {
  parameter: ActionFormParameter;
  isValueCleared?: boolean;
  isValueModified?: boolean;
  onValueUpdated: (
    field: string,
    value: RowValue,
    forceUpdate?: boolean,
  ) => void;
};

export function BulkUpdateRowFormInput({
  parameter,
  isValueCleared,
  isValueModified,
  onValueUpdated,
}: BulkUpdateRowFormInputProps) {
  const handleValueCleared = useCallback(() => {
    onValueUpdated(parameter.id, null, true);
  }, [parameter.id, onValueUpdated]);

  const handleValueUpdated = useCallback(
    (value: RowValue) => {
      if (parameter.nullable && !value) {
        value = null;
      }

      onValueUpdated(parameter.id, value);
    },
    [parameter.id, parameter.nullable, onValueUpdated],
  );

  const shouldDisplayClearButton = !isValueCleared && !parameter.readonly;

  const placeholder = isValueCleared
    ? "NULL"
    : !isValueModified
      ? t`(Unchanged)`
      : undefined;

  const rightSection = useMemo(
    () =>
      shouldDisplayClearButton && (
        <Icon
          name="close"
          color="var(--mb-color-text-light)"
          onClick={handleValueCleared}
          onMouseDown={(event) => event.stopPropagation()}
        />
      ),
    [shouldDisplayClearButton, handleValueCleared],
  );

  const rightSectionPointerEvents = "all";

  return (
    <ParameterActionInput
      parameter={parameter}
      onBlur={handleValueUpdated}
      onEnter={handleValueUpdated}
      inputProps={{
        rightSectionPointerEvents,
        rightSection,
        placeholder,
      }}
    />
  );
}
