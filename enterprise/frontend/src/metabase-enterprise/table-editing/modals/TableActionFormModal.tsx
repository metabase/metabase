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
} from "../api/types";

import { ModalParameterActionInput } from "./ModalParameterActionInput";
import S from "./TableActionFormModal.module.css";
import { TableActionFormModalParameter } from "./TableActionFormModalParameter";

interface TableActionFormModalProps {
  title: string;
  submitButtonText: string;
  opened: boolean;
  description?: DescribeActionFormResponse;
  isLoading: boolean;
  onClose: () => void;
  onSubmit: (data: RowCellsWithPkValue) => Promise<boolean>;
}

export function TableActionFormModal({
  title,
  submitButtonText,
  opened,
  description,
  isLoading,
  onClose,
  onSubmit,
}: TableActionFormModalProps) {
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
    initialValues: {} as RowCellsWithPkValue,
    onSubmit: handleFormikSubmit,
    validate: validateForm,
    validateOnMount: true,
  });

  // Reset form when modal is opened
  useEffect(() => {
    if (opened) {
      resetForm();
      revalidateForm();
    }
  }, [opened, resetForm, revalidateForm]);

  return (
    <Modal.Root opened={opened} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <form onSubmit={handleSubmit}>
          <Modal.Header px="xl" pb="0" className={S.modalHeader}>
            <Modal.Title>{title}</Modal.Title>
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
              <Center>
                <Loader />
              </Center>
            ) : (
              description.parameters.map((parameter) => {
                return (
                  <TableActionFormModalParameter
                    key={parameter.id}
                    parameter={parameter}
                  >
                    <CreateRowFormInput
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
              {submitButtonText}
            </Button>
          </Flex>
        </form>
      </Modal.Content>
    </Modal.Root>
  );
}

type CreateRowFormInputProps = {
  parameter: TableActionFormParameter;
  onChange: (field: string, value: RowValue) => void;
};

export function CreateRowFormInput({
  parameter,
  onChange,
}: CreateRowFormInputProps) {
  const handleChange = useCallback(
    (value: RowValue) => {
      onChange(parameter.id, value);
    },
    [parameter.id, onChange],
  );

  return (
    <ModalParameterActionInput parameter={parameter} onChange={handleChange} />
  );
}
