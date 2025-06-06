import { useDisclosure } from "@mantine/hooks";
import type { RowSelectionState } from "@tanstack/react-table";
import cx from "classnames";
import { Fragment, useCallback, useEffect, useState } from "react";
import { msgid, ngettext, t } from "ttag";
import { noop } from "underscore";

import { FIELD_SEMANTIC_TYPES_MAP } from "metabase/lib/core";
import { ActionIcon, Group, Icon, Modal, Text, rem } from "metabase/ui";
import { canEditField } from "metabase-enterprise/data_editing/helpers";
import type {
  DatasetColumn,
  FieldWithMetadata,
  RowValue,
  Table,
} from "metabase-types/api";

import type { UpdatedRowBulkHandlerParams } from "../../types";
import { EditingBodyCellConditional } from "../inputs";
import type { EditableTableColumnConfig } from "../use-editable-column-config";

import { DeleteBulkRowConfirmationModal } from "./DeleteBulkRowConfirmationModal";
import S from "./EditingBaseRowModal.module.css";
import { useEditingModalOrderedVisibleDatasetColumns } from "./use-editing-modal-ordered-dataset-columns";

interface EditBulkRowsModalProps {
  opened: boolean;
  datasetColumns: DatasetColumn[];
  datasetTable?: Table;
  onClose: () => void;
  onEdit: (data: UpdatedRowBulkHandlerParams) => Promise<boolean>;
  onDelete: (rowIndices: number[]) => Promise<boolean>;
  fieldMetadataMap: Record<FieldWithMetadata["name"], FieldWithMetadata>;
  hasDeleteAction: boolean;
  isDeleting?: boolean;
  columnsConfig?: EditableTableColumnConfig;
  selectedRowIndices: number[];
  setRowSelection: (state: RowSelectionState) => void;
}

export function EditBulkRowsModal({
  opened,
  datasetColumns,
  onClose,
  onEdit,
  onDelete,
  isDeleting,
  fieldMetadataMap,
  hasDeleteAction,
  columnsConfig,
  selectedRowIndices,
  setRowSelection,
}: EditBulkRowsModalProps) {
  // We need editing state to track null values for columns that were cleared
  const [editingState, setEditingState] = useState<Record<string, RowValue>>(
    {},
  );

  // Clear editing state on modal close
  useEffect(() => {
    setEditingState({});
  }, [opened]);

  const [
    isDeleteRequested,
    { open: requestDeletion, close: closeDeletionModal },
  ] = useDisclosure();

  // Columns might be reordered to match the order in `columnsConfig`
  const orderedVisibleDatasetColumns =
    useEditingModalOrderedVisibleDatasetColumns(datasetColumns, columnsConfig);

  const handleValueEdit = useCallback(
    async (key: string, value: RowValue, forceUpdate = false) => {
      // Skip update if the value is empty and the value was not changed before
      const valueWasModifiedBefore = key in editingState;
      if (!forceUpdate && !value && !valueWasModifiedBefore) {
        return;
      }

      const result = await onEdit({
        updatedData: { [key]: value },
        rowIndices: selectedRowIndices,
      });

      if (result) {
        setEditingState((prev) => ({ ...prev, [key]: value }));
      }
    },
    [onEdit, selectedRowIndices, setEditingState, editingState],
  );

  const handleDeleteConfirmation = useCallback(async () => {
    const result = await onDelete(selectedRowIndices);
    if (result) {
      setRowSelection({});
      onClose();
      closeDeletionModal();
    }
  }, [
    onDelete,
    selectedRowIndices,
    closeDeletionModal,
    onClose,
    setRowSelection,
  ]);

  if (isDeleteRequested) {
    return (
      <DeleteBulkRowConfirmationModal
        opened={true}
        onClose={closeDeletionModal}
        rowCount={selectedRowIndices.length}
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirmation}
      />
    );
  }

  return (
    <Modal.Root opened={opened} onClose={onClose}>
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
            {hasDeleteAction && (
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
          className={cx(S.modalBody, S.modalBodyEditing)}
        >
          {orderedVisibleDatasetColumns.map((column) => {
            const field = fieldMetadataMap?.[column.name];

            return (
              <Fragment key={column.id}>
                <Group h="2.5rem" align="center">
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
                    {field?.database_required && (
                      <Text component="span" c="error">
                        *
                      </Text>
                    )}
                  </Text>
                </Group>

                <BulkEditingInput
                  datasetColumn={column}
                  field={field}
                  onSubmitValue={handleValueEdit}
                  isValueCleared={editingState[column.name] === null}
                  isValueModified={column.name in editingState}
                  columnsConfig={columnsConfig}
                />
              </Fragment>
            );
          })}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

type BulkEditingInputProps = {
  datasetColumn: DatasetColumn;
  field?: FieldWithMetadata;
  onSubmitValue: (key: string, value: RowValue, forceUpdate?: boolean) => void;
  columnsConfig?: EditableTableColumnConfig;
  isValueCleared?: boolean;
  isValueModified?: boolean;
};

function BulkEditingInput({
  datasetColumn,
  field,
  onSubmitValue,
  columnsConfig,
  isValueCleared,
  isValueModified,
}: BulkEditingInputProps) {
  const disabled =
    columnsConfig?.isColumnReadonly(datasetColumn.name) || !canEditField(field);

  const handleValueClear = useCallback(() => {
    onSubmitValue(datasetColumn.name, null, true);
  }, [onSubmitValue, datasetColumn.name]);

  const handleValueSubmit = useCallback(
    (value: RowValue) => {
      onSubmitValue(datasetColumn.name, value);
    },
    [onSubmitValue, datasetColumn.name],
  );

  const placeholder = isValueCleared
    ? "NULL"
    : !isValueModified
      ? t`(Unchanged)`
      : undefined;

  return (
    <EditingBodyCellConditional
      autoFocus={false}
      datasetColumn={datasetColumn}
      field={field}
      initialValue={null}
      onCancel={noop}
      onSubmit={handleValueSubmit}
      inputProps={{
        placeholder,
        disabled,
        rightSectionPointerEvents: "all",
        rightSection: !disabled && !isValueCleared && (
          <Icon
            name="close"
            color="var(--mb-color-text-light)"
            onClick={handleValueClear}
            onMouseDown={(event) => event.stopPropagation()}
          />
        ),
      }}
      withTextarea
    />
  );
}
