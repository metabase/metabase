import cx from "classnames";
import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { ActionIcon, Group, Icon, Loader, Modal, rem } from "metabase/ui";
import type { RowValue } from "metabase-types/api";

import type {
  ActionFormParameter,
  DescribeActionFormResponse,
  UpdatedRowHandlerParams,
} from "../../types";
import { ParameterActionInput } from "../inputs_v2/ParameterActionInput";

import { ActionFormModalParameter } from "./ActionFormModalParameter";
import { DeleteRowConfirmationModal } from "./DeleteRowConfirmationModal";
import S from "./EditingBaseRowModal.module.css";

interface ActionUpdateRowFormModalProps {
  opened: boolean;
  rowIndex: number | null;
  rowData: Record<string, RowValue> | null;
  description?: DescribeActionFormResponse;
  onClose: () => void;
  onRowUpdate: (data: UpdatedRowHandlerParams) => Promise<boolean>;
  onRowDelete: (rowIndex: number) => Promise<boolean>;
  withDelete?: boolean;
}

enum ModalState {
  Opened,
  DeleteRequested,
  Closed,
}

export function ActionUpdateRowFormModal({
  opened,
  rowIndex,
  rowData,
  description,
  onClose,
  onRowUpdate,
  onRowDelete,
  withDelete = false,
}: ActionUpdateRowFormModalProps) {
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
    (field: string, value: RowValue) => {
      if (rowIndex !== null) {
        onRowUpdate({ updatedData: { [field]: value }, rowIndex });
      }
    },
    [onRowUpdate, rowIndex],
  );

  const handleDeleteConfirmation = useCallback(async () => {
    if (rowIndex !== null) {
      onClose();
      await onRowDelete(rowIndex);
    }
  }, [onRowDelete, rowIndex, onClose]);

  if (modalState === ModalState.DeleteRequested) {
    return (
      <DeleteRowConfirmationModal
        onCancel={closeDeletionModal}
        onConfirm={handleDeleteConfirmation}
      />
    );
  }

  return (
    <Modal.Root opened={modalState === ModalState.Opened} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header px="xl" pb="0" className={S.modalHeader}>
          <Modal.Title>{t`Edit record`}</Modal.Title>
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
                  <UpdateRowFormInput
                    initialValue={rowData?.[parameter.id]}
                    parameter={parameter}
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

type UpdateRowFormInputProps = {
  initialValue?: RowValue;
  parameter: ActionFormParameter;
  onValueUpdated: (field: string, value: RowValue) => void;
};

export function UpdateRowFormInput({
  initialValue,
  parameter,
  onValueUpdated,
}: UpdateRowFormInputProps) {
  const handleValueUpdated = useCallback(
    (value: RowValue) => {
      onValueUpdated(parameter.id, value);
    },
    [parameter.id, onValueUpdated],
  );

  return (
    <ParameterActionInput
      initialValue={initialValue?.toString()}
      parameter={parameter}
      onBlur={handleValueUpdated}
      onEnter={handleValueUpdated}
    />
  );
}
