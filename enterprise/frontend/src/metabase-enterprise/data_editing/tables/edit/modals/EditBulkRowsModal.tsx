import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { Fragment } from "react";
import { msgid, ngettext, t } from "ttag";
import { noop } from "underscore";

import { FIELD_SEMANTIC_TYPES_MAP } from "metabase/lib/core";
import { ActionIcon, Group, Icon, Modal, Text, rem } from "metabase/ui";
import { canEditField } from "metabase-enterprise/data_editing/helpers";
import type {
  DatasetColumn,
  FieldWithMetadata,
  Table,
} from "metabase-types/api";

import { EditingBodyCellConditional } from "../inputs";
import type { EditingBodyPrimitiveProps } from "../inputs/types";
import type { EditableTableColumnConfig } from "../use-editable-column-config";

import { DeleteBulkRowConfirmationModal } from "./DeleteBulkRowConfirmationModal";
import S from "./EditingBaseRowModal.module.css";
import { useEditingModalOrderedDatasetColumns } from "./use-editing-modal-ordered-dataset-columns";

interface EditBulkRowsModalProps {
  opened: boolean;
  datasetColumns: DatasetColumn[];
  datasetTable?: Table;
  onClose: () => void;
  fieldMetadataMap: Record<FieldWithMetadata["name"], FieldWithMetadata>;
  hasDeleteAction: boolean;
  isLoading?: boolean;
  columnsConfig?: EditableTableColumnConfig;
  selectedRowIndices: number[];
}

export function EditBulkRowsModal({
  opened,
  datasetColumns,
  onClose,
  fieldMetadataMap,
  hasDeleteAction,
  columnsConfig,
  selectedRowIndices,
}: EditBulkRowsModalProps) {
  const [
    isDeleteRequested,
    { open: requestDeletion, close: closeDeletionModal },
  ] = useDisclosure();

  // Columns might be reordered to match the order in `columnsConfig`
  const orderedDatasetColumns = useEditingModalOrderedDatasetColumns(
    datasetColumns,
    columnsConfig,
  );

  if (isDeleteRequested) {
    return (
      <DeleteBulkRowConfirmationModal
        opened={true}
        onClose={closeDeletionModal}
        rowCount={selectedRowIndices.length}
        isLoading={false}
        onConfirm={() => {}}
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
          {orderedDatasetColumns.map((column) => {
            const field = fieldMetadataMap?.[column.name];
            const disabled =
              columnsConfig?.isColumnReadonly(column.name) ||
              !canEditField(field);

            const inputProps: EditingBodyPrimitiveProps["inputProps"] = {
              placeholder: t`(Unchanged)`,
              disabled,
              rightSectionPointerEvents: "all",
              rightSection: !disabled && (
                <Icon
                  name="close"
                  color="var(--mb-color-text-light)"
                  onClick={() => {}}
                  onMouseDown={(event) => event.stopPropagation()}
                />
              ),
            };

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
                  {field?.database_required && (
                    <Text component="span" c="error">
                      *
                    </Text>
                  )}
                </Text>

                <EditingBodyCellConditional
                  autoFocus={false}
                  datasetColumn={column}
                  field={field}
                  initialValue={null}
                  onCancel={noop}
                  onSubmit={noop}
                  onChangeValue={noop}
                  inputProps={inputProps}
                />
              </Fragment>
            );
          })}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
