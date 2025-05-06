import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useFormik } from "formik";
import { Fragment, useCallback, useEffect, useMemo } from "react";
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
  FieldWithMetadata,
  RowValue,
  RowValues,
  Table,
} from "metabase-types/api";

import type { UpdatedRowHandlerParams } from "../../types";
import { EditingBodyCellConditional } from "../inputs";
import type { EditableTableColumnConfig } from "../use-editable-column-config";

import { DeleteRowConfirmationModal } from "./DeleteRowConfirmationModal";
import S from "./EditingBaseRowModal.module.css";
import type { TableEditingModalState } from "./use-table-modal";
import { TableEditingModalAction } from "./use-table-modal";

interface EditingBaseRowModalProps {
  datasetColumns: DatasetColumn[];
  datasetTable?: Table;
  modalState: TableEditingModalState;
  onClose: () => void;
  onEdit: (data: UpdatedRowHandlerParams) => Promise<boolean>;
  onRowCreate: (data: Record<string, RowValue>) => Promise<boolean>;
  onRowDelete: (rowIndex: number) => Promise<boolean>;
  currentRowData?: RowValues;
  fieldMetadataMap: Record<FieldWithMetadata["name"], FieldWithMetadata>;
  hasDeleteAction: boolean;
  isLoading?: boolean;
  columnsConfig?: EditableTableColumnConfig;
}

type EditingFormValues = Record<string, RowValue>;

export function EditingBaseRowModal({
  datasetColumns,
  modalState,
  onClose,
  onEdit,
  onRowCreate,
  onRowDelete,
  currentRowData,
  fieldMetadataMap,
  hasDeleteAction,
  isLoading,
  columnsConfig,
}: EditingBaseRowModalProps) {
  const isEditingMode = !!currentRowData;

  const [
    isDeleteRequested,
    { open: requestDeletion, close: closeDeletionModal },
  ] = useDisclosure();

  const validateForm = useCallback(
    (values: EditingFormValues) => {
      const errors: Record<string, string> = {};

      datasetColumns.forEach((column) => {
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

  const onSubmit = useCallback(
    async (values: EditingFormValues) => {
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
    errors,
    validateForm: revalidateForm,
  } = useFormik({
    initialValues: {} as EditingFormValues,
    onSubmit,
    validate: validateForm,
    validateOnMount: true,
  });

  // Clear new row data when modal is opened
  useEffect(() => {
    if (modalState.action === TableEditingModalAction.Create) {
      resetForm();
      revalidateForm();
    }
  }, [modalState.action, resetForm, revalidateForm]);

  const handleValueEdit = useCallback(
    (key: string, value: RowValue) => {
      if (modalState.rowIndex != null && isEditingMode) {
        onEdit({
          rowIndex: modalState.rowIndex,
          updatedData: {
            [key]: value,
          },
        });
      }
    },
    [isEditingMode, modalState.rowIndex, onEdit],
  );

  const handleDeleteConfirmation = useCallback(async () => {
    if (modalState.rowIndex !== undefined) {
      closeDeletionModal();
      onClose();

      await onRowDelete(modalState.rowIndex);
    }
  }, [closeDeletionModal, onRowDelete, modalState.rowIndex, onClose]);

  // Columns might be reordered to match the order in `columnsConfig`
  const orderedDatasetColumns = useMemo(() => {
    if (!columnsConfig) {
      return datasetColumns;
    }

    return columnsConfig.columnOrder
      .map((name) => datasetColumns.find((it) => it.name === name))
      .filter((it): it is DatasetColumn => it !== undefined);
  }, [columnsConfig, datasetColumns]);

  // We can't use `currentRowData` in case
  // when colums are reordered due to `columnsConfig`
  const currentRowDataMap = useMemo(() => {
    if (!currentRowData) {
      return {};
    }

    return datasetColumns.reduce(
      (acc, column, index) => ({
        ...acc,
        [column.name]: currentRowData[index],
      }),
      {} as Record<string, RowValue>,
    );
  }, [currentRowData, datasetColumns]);

  if (isDeleteRequested) {
    return (
      <DeleteRowConfirmationModal
        onCancel={closeDeletionModal}
        onConfirm={handleDeleteConfirmation}
      />
    );
  }

  return (
    <Modal.Root opened={modalState.action !== null} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <form onSubmit={handleSubmit}>
          <Modal.Header px="xl" pb="0" className={S.modalHeader}>
            <Modal.Title>
              {isEditingMode ? t`Edit record` : t`Create a new record`}
            </Modal.Title>
            <Group
              gap="xs"
              mr={rem(-5) /* aligns cross with modal right padding */}
            >
              {isEditingMode && hasDeleteAction && (
                <ActionIcon variant="subtle" onClick={requestDeletion}>
                  <Icon name="trash" />
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
            {orderedDatasetColumns.map((column) => {
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
                    initialValue={currentRowDataMap[column.name] ?? null}
                    datasetColumn={column}
                    field={field}
                    onSubmitValue={handleValueEdit}
                    onChangeValue={setFieldValue}
                    error={!isEditingMode && !!errors[column.name]}
                    disabled={columnsConfig?.isColumnReadonly(column.name)}
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
  field?: FieldWithMetadata;
  onSubmitValue: (key: string, value: RowValue) => void;
  onChangeValue: (key: string, value: RowValue) => void;
  error?: boolean;
  disabled?: boolean;
};
function ModalEditingInput({
  isEditingMode,
  initialValue,
  datasetColumn,
  field,
  onSubmitValue,
  onChangeValue,
  error,
  disabled,
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
      inputProps={{ error, disabled }}
    />
  );
}
