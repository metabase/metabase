import cx from "classnames";
import { Fragment } from "react";

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
import type { DatasetColumn, RowValues } from "metabase-types/api";

import { EditingBodyCellConditional } from "../inputs";

import S from "./EditingBaseRowModal.module.css";

interface EditingBaseRowModalProps {
  datasetColumns: DatasetColumn[];
  onClose: () => void;
  opened: boolean;
  currentRowData?: RowValues;
}

export function EditingBaseRowModal({
  datasetColumns,
  onClose,
  opened,
  currentRowData,
}: EditingBaseRowModalProps) {
  const isEditingMode = !!currentRowData;

  return (
    <Modal.Root opened={opened} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header px="xl" pb="0" className={S.modalHeader}>
          <Modal.Title>Create a new record</Modal.Title>
          <Group
            gap="xs"
            mr={rem(-5) /* alings cross with modal right padding */}
          >
            {isEditingMode && (
              <ActionIcon variant="subtle">
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
          {datasetColumns.map((column, index) => (
            <Fragment key={column.id}>
              <Icon className={S.modalBodyColumn} name="grabber" />
              <Text className={S.modalBodyColumn}>{column.display_name}</Text>
              <EditingBodyCellConditional
                autoFocus={false}
                datasetColumn={column}
                initialValue={currentRowData ? currentRowData[index] : null}
                onCancel={() => {}}
                onSubmit={() => {}}
              />
            </Fragment>
          ))}
        </Modal.Body>
        {!isEditingMode && (
          <Flex px="xl" className={S.modalFooter} gap="lg" justify="flex-end">
            <Button variant="subtle" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="filled">Create new record</Button>
          </Flex>
        )}
      </Modal.Content>
    </Modal.Root>
  );
}
