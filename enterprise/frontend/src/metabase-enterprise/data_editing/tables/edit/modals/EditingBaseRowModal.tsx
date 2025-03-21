import cx from "classnames";
import { Fragment, useCallback, useEffect, useState } from "react";
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
  onValueChange: (data: UpdatedRowCellsHandlerParams) => void;
  onRowCreate: (data: Record<string, RowValue>) => void;
  onRowDelete: (rowIndex: number) => void;
  opened: boolean;
  currentRowIndex?: number;
  currentRowData?: RowValues;
  isLoading?: boolean;
}

export function EditingBaseRowModal({
  datasetColumns,
  onClose,
  onValueChange,
  onRowCreate,
  onRowDelete,
  opened,
  currentRowIndex,
  currentRowData,
  isLoading,
}: EditingBaseRowModalProps) {
  const [newRowData, setNewRowData] = useState<Record<string, RowValue>>({});
  const isEditingMode = !!currentRowData;

  // Clear new row data when modal is opened
  useEffect(() => {
    if (opened) {
      setNewRowData({});
    }
  }, [opened]);

  const handleValueChange = useCallback(
    (key: string, value: RowValue) => {
      if (isEditingMode && currentRowIndex) {
        onValueChange({
          rowIndex: currentRowIndex,
          data: {
            [key]: value,
          },
        });
      }

      if (!isEditingMode) {
        setNewRowData(data => ({
          ...data,
          [key]: value,
        }));
      }
    },
    [isEditingMode, currentRowIndex, onValueChange],
  );

  return (
    <Modal.Root opened={opened} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
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
          {datasetColumns.map((column, index) => (
            <Fragment key={column.id}>
              <Icon
                className={S.modalBodyColumn}
                name={
                  column.semantic_type
                    ? FIELD_SEMANTIC_TYPES_MAP[column.semantic_type].icon
                    : "string"
                }
              />
              <Text className={S.modalBodyColumn}>{column.display_name}</Text>
              <EditingBodyCellConditional
                autoFocus={false}
                datasetColumn={column}
                initialValue={currentRowData ? currentRowData[index] : null}
                onCancel={noop}
                onSubmit={value => handleValueChange(column.name, value)}
                inputProps={{
                  disabled: column.semantic_type === "type/PK",
                  // Temporarily use a placeholder and figure out how to deal with null and default values later
                  placeholder:
                    column.name in newRowData ? "<empty_string>" : "<default>",
                }}
              />
            </Fragment>
          ))}
        </Modal.Body>
        {!isEditingMode && (
          <Flex px="xl" className={S.modalFooter} gap="lg" justify="flex-end">
            <Button variant="subtle" onClick={onClose}>
              {t`Cancel`}
            </Button>
            <Button
              disabled={isLoading || Object.keys(newRowData).length === 0}
              variant="filled"
              onClick={() => onRowCreate(newRowData)}
            >{t`Create new record`}</Button>
          </Flex>
        )}
      </Modal.Content>
    </Modal.Root>
  );
}
