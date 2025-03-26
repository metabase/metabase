import cx from "classnames";
import { useFormik } from "formik";
import { Fragment, useCallback, useEffect } from "react";
import { t } from "ttag";
import { noop } from "underscore";

import { FIELD_SEMANTIC_TYPES_MAP } from "metabase/lib/core";
import {
  ActionIcon,
  Button,
  Flex,
  Group,
  Icon,
  Modal,
  Text,
  rem,
} from "metabase/ui";
import type {
  DatasetColumn,
  Field,
  RowValue,
  RowValues,
  Table,
} from "metabase-types/api";

import type { UpdatedRowCellsHandlerParams } from "../../types";
import { EditingBodyCellConditional } from "../inputs";

import S from "./EditingBaseRowModal.module.css";

interface EditingBaseRowModalProps {
  datasetColumns: DatasetColumn[];
  datasetTable?: Table;
  onClose: () => void;
  onEdit: (data: UpdatedRowCellsHandlerParams) => void;
  onRowCreate: (data: Record<string, RowValue>) => void;
  onRowDelete: (rowIndex: number) => void;
  opened: boolean;
  currentRowIndex?: number;
  currentRowData?: RowValues;
  isLoading?: boolean;
  fieldMetadataMap?: Record<Field["name"], Field>;
}

type EditingFormValues = Record<string, RowValue>;

export function EditingBaseRowModal({
  datasetColumns,
  onClose,
  onEdit,
  onRowCreate,
  onRowDelete,
  opened,
  currentRowIndex,
  currentRowData,
  isLoading,
  fieldMetadataMap,
}: EditingBaseRowModalProps) {
  const isEditingMode = !!currentRowData;

  const validateForm = useCallback(
    (values: EditingFormValues) => {
      const errors: Record<string, string> = {};

      datasetColumns.forEach(column => {
        const field = fieldMetadataMap?.[column.name];
        const isRequired = field?.database_required;
        if (isRequired && !values[column.name]) {
          errors[column.name] = t`This column is required`;
        }
      });

      return errors;
    },
    [fieldMetadataMap, datasetColumns],
  );

  const {
    isValid,
    resetForm,
    setFieldValue,
    handleSubmit,
    errors,
    validateForm: revalidateForm,
  } = useFormik({
    initialValues: {} as EditingFormValues,
    onSubmit: onRowCreate,
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

  const handleValueEdit = useCallback(
    (key: string, value: RowValue) => {
      if (currentRowIndex !== undefined && isEditingMode) {
        onEdit({
          rowIndex: currentRowIndex,
          data: {
            [key]: value,
          },
        });
      }
    },
    [isEditingMode, currentRowIndex, onEdit],
  );

  return (
    <Modal.Root opened={opened} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <form onSubmit={handleSubmit}>
          <Modal.Header px="xl" pb="0" className={S.modalHeader}>
            <Modal.Title>
              {isEditingMode ? t`Edit record` : t`Create a new record`}
            </Modal.Title>
            <Group
              gap="xs"
              mr={rem(-5) /* alings cross with modal right padding */}
            >
              {isEditingMode && currentRowIndex !== undefined && (
                <ActionIcon variant="subtle">
                  <Icon
                    name="trash"
                    onClick={() => onRowDelete(currentRowIndex)}
                  />
                </ActionIcon>
              )}
              <ActionIcon variant="subtle" onClick={onClose}>
                <Icon name="close" />
              </ActionIcon>
            </Group>
          </Modal.Header>
          <Modal.Body
            px="xl"
            py="lg"
            className={cx(S.modalBody, { [S.modalBodyEditing]: isEditingMode })}
          >
            {datasetColumns.map((column, index) => {
              const field = fieldMetadataMap?.[column.name];

              return (
                <Fragment key={column.id}>
                  <Icon
                    className={S.modalBodyColumn}
                    name={
                      column.semantic_type
                        ? FIELD_SEMANTIC_TYPES_MAP[column.semantic_type].icon
                        : "string"
                    }
                  />
                  <Text className={S.modalBodyColumn}>
                    {column.display_name}
                  </Text>
                  <ModalEditingInput
                    isEditingMode={isEditingMode}
                    initialValue={currentRowData ? currentRowData[index] : null}
                    datasetColumn={column}
                    field={field}
                    onSubmitValue={handleValueEdit}
                    onChangeValue={setFieldValue}
                    error={!isEditingMode && !!errors[column.name]}
                  />
                </Fragment>
              );
            })}
          </Modal.Body>
          {!isEditingMode && (
            <Flex px="xl" className={S.modalFooter} gap="lg" justify="flex-end">
              <Button variant="subtle" onClick={onClose}>
                {t`Cancel`}
              </Button>
              <Button
                disabled={isLoading || !isValid}
                variant="filled"
                type="submit"
              >{t`Create new record`}</Button>
            </Flex>
          )}
        </form>
      </Modal.Content>
    </Modal.Root>
  );
}

type EditingInputWithEventsProps = {
  isEditingMode: boolean;
  initialValue?: RowValue;
  datasetColumn: DatasetColumn;
  field?: Field;
  onSubmitValue: (key: string, value: RowValue) => void;
  onChangeValue: (key: string, value: RowValue) => void;
  error?: boolean;
};
function ModalEditingInput({
  isEditingMode,
  initialValue,
  datasetColumn,
  field,
  onSubmitValue,
  onChangeValue,
  error,
}: EditingInputWithEventsProps) {
  // The difference is that in editing mode we handle change only when value is ready (e.g. on blur)
  // whereas in creating mode we handle change immediately to update the form state
  const handleValueSubmit = useCallback(
    (value: RowValue) => {
      if (isEditingMode) {
        onSubmitValue(datasetColumn.name, value);
      }
    },
    [isEditingMode, datasetColumn.name, onSubmitValue],
  );

  const handleValueChange = useCallback(
    (value: RowValue) => {
      if (!isEditingMode) {
        onChangeValue(datasetColumn.name, value);
      }
    },
    [isEditingMode, datasetColumn.name, onChangeValue],
  );

  return (
    <EditingBodyCellConditional
      autoFocus={false}
      datasetColumn={datasetColumn}
      field={field}
      initialValue={initialValue ?? null}
      onCancel={noop}
      onSubmit={handleValueSubmit}
      onChangeValue={handleValueChange}
      inputProps={{ error }}
    />
  );
}
