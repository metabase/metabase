import cx from "classnames";
import { useFormik } from "formik";
import { useCallback, useEffect } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Button,
  Flex,
  Group,
  Icon,
  Loader,
  Modal,
  rem,
} from "metabase/ui";
import type { RowValue } from "metabase-types/api";

import type {
  ActionFormParameter,
  DescribeActionFormResponse,
  RowCellsWithPkValue,
} from "../../types";
import { ParameterActionInput } from "../inputs_v2/ParameterActionInput";

import S from "./ActionFormModal.css";
import { ActionFormModalParameter } from "./ActionFormModalParameter";

interface ActionCreateRowFormModalProps {
  opened: boolean;
  description?: DescribeActionFormResponse;
  isInserting: boolean;
  onClose: () => void;
  onRowCreate: (data: RowCellsWithPkValue) => Promise<boolean>;
}

export function ActionCreateRowFormModal({
  opened,
  description,
  isInserting,
  onClose,
  onRowCreate,
}: ActionCreateRowFormModalProps) {
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

  const onSubmit = useCallback(
    async (values: RowCellsWithPkValue) => {
      const success = await onRowCreate(values);
      if (success) {
        onClose();
      }
    },
    [onClose, onRowCreate],
  );

  const {
    isValid,
    resetForm,
    setFieldValue,
    handleSubmit,
    validateForm: revalidateForm,
  } = useFormik({
    initialValues: {} as RowCellsWithPkValue,
    onSubmit,
    validate: validateForm,
    validateOnMount: true,
  });

  // Clear new row data when modal is opened
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
              <Loader />
            ) : (
              description.parameters.map((parameter) => {
                return (
                  <ActionFormModalParameter
                    key={parameter.id}
                    parameter={parameter}
                  >
                    <CreateRowFormInput
                      parameter={parameter}
                      onChange={setFieldValue}
                    />
                  </ActionFormModalParameter>
                );
              })
            )}
          </Modal.Body>
          <Flex px="xl" className={S.modalFooter} gap="lg" justify="flex-end">
            <Button variant="subtle" onClick={onClose}>
              {t`Cancel`}
            </Button>
            <Button
              disabled={isInserting || !isValid}
              variant="filled"
              type="submit"
            >{t`Create new record`}</Button>
          </Flex>
        </form>
      </Modal.Content>
    </Modal.Root>
  );
}

type CreateRowFormInputProps = {
  parameter: ActionFormParameter;
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

  return <ParameterActionInput parameter={parameter} onChange={handleChange} />;
}
