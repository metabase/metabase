import cx from "classnames";
import { useFormik } from "formik";
import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Button,
  Center,
  Flex,
  Group,
  Icon,
  Loader,
  Modal,
  rem,
} from "metabase/ui";
import type { RowValue } from "metabase-types/api";

import type {
  DescribeActionFormResponse,
  RowCellsWithPkValue,
  TableActionFormParameter,
} from "../../api/types";

import { DeleteRowConfirmationModal } from "./DeleteRowConfirmationModal";
import { ModalParameterActionInput } from "./ModalParameterActionInput";
import S from "./TableActionFormModal.module.css";
import { TableActionFormModalParameter } from "./TableActionFormModalParameter";

interface UpdateRowActionFormModalProps {
  opened: boolean;
  description?: DescribeActionFormResponse;
  isLoading: boolean;
  isDeleting: boolean;
  initialValues?: RowCellsWithPkValue;
  onClose: () => void;
  onSubmit: (data: RowCellsWithPkValue) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}

enum ModalState {
  Opened,
  DeleteRequested,
  Closed,
}

export function UpdateRowActionFormModal({
  opened,
  description,
  isLoading,
  isDeleting,
  initialValues,
  onClose,
  onSubmit,
  onDelete,
}: UpdateRowActionFormModalProps) {
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

  const handleDeleteConfirmation = useCallback(async () => {
    const result = await onDelete();

    if (result) {
      onClose();
    }
  }, [onDelete, onClose]);

  const validateForm = useCallback(
    (values: RowCellsWithPkValue) => {
      const errors: Record<string, string> = {};

      const updatedKeys = Object.keys(values);
      if (updatedKeys.length === 0) {
        errors.all = t`No changes to save`;
      }

      for (const key of updatedKeys) {
        const parameter = description?.parameters.find((p) => p.id === key);
        const isRequired = !parameter?.optional;
        if (isRequired && !values[key]) {
          errors[key] = t`This column is required`;
        }
      }

      return errors;
    },
    [description?.parameters],
  );

  const handleFormikSubmit = useCallback(
    async (values: RowCellsWithPkValue) => {
      const success = await onSubmit(values);
      if (success) {
        onClose();
      }
    },
    [onClose, onSubmit],
  );

  const {
    isValid,
    resetForm,
    setFieldValue,
    handleSubmit,
    validateForm: revalidateForm,
  } = useFormik({
    // We want to track only changed values, not all values
    initialValues: {},
    onSubmit: handleFormikSubmit,
    validate: validateForm,
    validateOnMount: true,
  });

  // Reset form when modal is opened
  useEffect(() => {
    if (opened) {
      resetForm();
      revalidateForm({});
    }
  }, [opened, resetForm, revalidateForm]);

  if (modalState === ModalState.DeleteRequested) {
    return (
      <DeleteRowConfirmationModal
        isLoading={isDeleting}
        onCancel={closeDeletionModal}
        onConfirm={handleDeleteConfirmation}
      />
    );
  }

  return (
    <Modal.Root opened={opened} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <form onSubmit={handleSubmit}>
          <Modal.Header px="xl" pb="0" className={S.modalHeader}>
            <Modal.Title>{t`Edit record`}</Modal.Title>
            <Group
              gap="xs"
              mr={rem(-5) /* aligns cross with modal right padding */}
            >
              <ActionIcon
                variant="subtle"
                onClick={requestDeletion}
                data-testid="delete-row-icon"
              >
                <Icon name="trash" />
              </ActionIcon>
              <ActionIcon variant="subtle" onClick={onClose}>
                <Icon name="close" />
              </ActionIcon>
            </Group>
          </Modal.Header>
          <Modal.Body px="xl" py="lg" className={cx(S.modalBody)}>
            {!description ? (
              <Center className={S.modalBodyLoader}>
                <Loader />
              </Center>
            ) : (
              description.parameters.map((parameter) => {
                return (
                  <TableActionFormModalParameter
                    key={parameter.id}
                    parameter={parameter}
                  >
                    <ModalFormInput
                      initialValue={initialValues?.[parameter.id]}
                      parameter={parameter}
                      onChange={setFieldValue}
                    />
                  </TableActionFormModalParameter>
                );
              })
            )}
          </Modal.Body>
          <Flex px="xl" className={S.modalFooter} gap="lg" justify="flex-end">
            <Button variant="subtle" onClick={onClose}>
              {t`Cancel`}
            </Button>
            <Button
              disabled={isLoading || !isValid}
              variant="filled"
              type="submit"
              data-testid="update-row-save-button"
            >
              {t`Save`}
            </Button>
          </Flex>
        </form>
      </Modal.Content>
    </Modal.Root>
  );
}

type ModalFormInputProps = {
  initialValue?: RowValue;
  parameter: TableActionFormParameter;
  onChange: (field: string, value: RowValue) => void;
};

export function ModalFormInput({
  initialValue,
  parameter,
  onChange,
}: ModalFormInputProps) {
  const handleChange = useCallback(
    (value: RowValue) => {
      onChange(parameter.id, value);
    },
    [parameter.id, onChange],
  );

  return (
    <ModalParameterActionInput
      initialValue={initialValue?.toString()}
      parameter={parameter}
      onChange={handleChange}
    />
  );
}
