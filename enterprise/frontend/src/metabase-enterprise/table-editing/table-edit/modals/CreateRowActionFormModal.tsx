import cx from "classnames";
import { useFormik } from "formik";
import { useCallback, useEffect } from "react";
import { t } from "ttag";

import { LeaveConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import Animation from "metabase/css/core/animation.module.css";
import { Box, Button, Center, Flex, Loader, Modal } from "metabase/ui";
import type { RowValue } from "metabase-types/api";

import type {
  DescribeActionFormResponse,
  RowCellsWithPkValue,
  TableActionFormParameter,
} from "../../api/types";

import { ModalParameterActionInput } from "./ModalParameterActionInput";
import S from "./TableActionFormModal.module.css";
import { TableActionFormModalParameter } from "./TableActionFormModalParameter";
import { useActionFormUnsavedLeaveConfirmation } from "./use-action-form-unsaved-leave-confirmation";

interface CreateRowActionFormModalProps {
  opened: boolean;
  description?: DescribeActionFormResponse;
  isLoading: boolean;
  initialValues?: RowCellsWithPkValue;
  onClose: () => void;
  onSubmit: (data: RowCellsWithPkValue) => Promise<boolean>;
}

export function CreateRowActionFormModal({
  opened,
  description,
  isLoading,
  initialValues,
  onClose,
  onSubmit,
}: CreateRowActionFormModalProps) {
  const validateForm = useCallback(
    (values: RowCellsWithPkValue) => {
      const errors: Record<string, string> = {};

      description?.parameters.forEach((parameter) => {
        const isRequired = !parameter.optional;
        if (isRequired && !values[parameter.id]) {
          errors[parameter.id] = t`This column is required`;
        }
      });

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
    values,
    validateForm: revalidateForm,
  } = useFormik({
    initialValues: initialValues ?? ({} as Record<string, RowValue>),
    onSubmit: handleFormikSubmit,
    validate: validateForm,
    validateOnMount: true,
  });

  // Reset form when modal is opened
  useEffect(() => {
    if (opened) {
      resetForm({ values: initialValues });
      revalidateForm();
    }
  }, [opened, resetForm, revalidateForm, initialValues]);

  const shouldShowLeaveConfirmation = useCallback(() => {
    return Object.keys(values).length > 0;
  }, [values]);

  const {
    showLeaveConfirmation,
    handleClose,
    handleContinue,
    handleLeaveConfirmation,
  } = useActionFormUnsavedLeaveConfirmation({
    shouldShowLeaveConfirmation,
    onClose,
  });

  return (
    <>
      <LeaveConfirmModal
        opened={showLeaveConfirmation}
        onConfirm={handleLeaveConfirmation}
        onClose={handleContinue}
      />
      <Modal.Root opened={opened} onClose={handleClose}>
        <Modal.Overlay />
        <Modal.Content
          transitionProps={{ transition: "slide-left" }}
          classNames={{
            content: cx(S.modalContent, Animation.slideLeft),
          }}
        >
          <form onSubmit={handleSubmit}>
            <Modal.Header px="xl" pb="0" className={S.modalHeader}>
              <Modal.Title>{t`Create a new record`}</Modal.Title>
            </Modal.Header>
            <Modal.Body px="xl" py="lg" className={cx(S.modalBody)}>
              <Box className={S.modalBodyGrid}>
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
                          initialValue={
                            values[parameter.id] ??
                            initialValues?.[parameter.id]
                          }
                          parameter={parameter}
                          onChange={setFieldValue}
                        />
                      </TableActionFormModalParameter>
                    );
                  })
                )}
              </Box>
            </Modal.Body>
            <Flex px="xl" className={S.modalFooter} gap="lg" justify="flex-end">
              <Button variant="subtle" onClick={handleClose}>
                {t`Cancel`}
              </Button>
              <Button
                disabled={isLoading || !isValid}
                variant="filled"
                type="submit"
                data-testid="create-row-form-submit-button"
              >
                {t`Create`}
              </Button>
            </Flex>
          </form>
        </Modal.Content>
      </Modal.Root>
    </>
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
