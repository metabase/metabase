import cx from "classnames";
import { useFormik } from "formik";
import { useCallback, useEffect } from "react";
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

import { ModalParameterActionInput } from "./ModalParameterActionInput";
import S from "./TableActionFormModal.module.css";
import { TableActionFormModalParameter } from "./TableActionFormModalParameter";

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
    validateForm: revalidateForm,
  } = useFormik({
    initialValues: initialValues ?? {},
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

  return (
    <Modal.Root opened={opened} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <form onSubmit={handleSubmit}>
          <Modal.Header px="xl" pb="0" className={S.modalHeader}>
            <Modal.Title>{t`Create a new record`}</Modal.Title>
            <Group
              gap="xs"
              mr={rem(-5) /* aligns cross with modal right padding */}
            >
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
            >
              {t`Create`}
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
