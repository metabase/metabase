import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
import { t } from "ttag";

import { useGetTableQueryMetadataQuery } from "metabase/api";
import type { OmniPickerItem } from "metabase/common/components/Pickers";
import { DataPickerModal } from "metabase/common/components/Pickers/DataPicker";
import { MiniPicker } from "metabase/common/components/Pickers/MiniPicker";
import type {
  MiniPickerItem,
  MiniPickerPickableItem,
} from "metabase/common/components/Pickers/MiniPicker/types";
import {
  Box,
  Flex,
  Icon,
  Paper,
  Select,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { TableId } from "metabase-types/api";

import type { TableColumnSelection } from "./RlsDataSelector";
import S from "./RlsDataSelector.module.css";

interface TableColumnCardProps {
  selection: TableColumnSelection;
  onChange: (selection: TableColumnSelection) => void;
  onRemove?: () => void;

  /** Table IDs that are already selected in other cards and should be hidden */
  selectedTableIds?: TableId[];
}

export const TableColumnCard = ({
  selection,
  onChange,
  onRemove,
  selectedTableIds = [],
}: TableColumnCardProps) => {
  const [isPickerOpen, { close: closePicker, open: openPicker }] =
    useDisclosure(false);
  const [isBrowsing, { open: openBrowse, close: closeBrowse }] =
    useDisclosure(false);

  const { data: tableMetadata, isLoading: isLoadingTable } =
    useGetTableQueryMetadataQuery(
      { id: selection.tableId! },
      { skip: !selection.tableId },
    );

  const handleTableSelect = useCallback(
    (item: MiniPickerPickableItem) => {
      if (item.model === "table") {
        onChange({ tableId: item.id, columnId: null });
        closePicker();
      }
    },
    [onChange, closePicker],
  );

  const handleModalSelect = useCallback(
    (tableId: TableId) => {
      onChange({ tableId, columnId: null });
      closeBrowse();
    },
    [onChange, closeBrowse],
  );

  const handleBrowseAll = useCallback(() => {
    closePicker();
    openBrowse();
  }, [closePicker, openBrowse]);

  const handleColumnSelect = useCallback(
    (columnId: string | null) => {
      onChange({
        ...selection,
        columnId: columnId ? Number(columnId) : null,
      });
    },
    [selection, onChange],
  );

  const columnOptions =
    tableMetadata?.fields?.map((field) => ({
      value: String(field.id),
      label: field.display_name,
    })) ?? [];

  const selectedTableName = tableMetadata?.display_name;

  const pickerValue = selection.tableId
    ? { model: "table" as const, id: selection.tableId }
    : undefined;

  // Hide tables that are already selected in other cards
  const shouldHidePickerItem = useCallback(
    (pickerItem: MiniPickerItem | OmniPickerItem) =>
      pickerItem.model === "table" && selectedTableIds.includes(pickerItem.id),
    [selectedTableIds],
  );

  return (
    <Paper withBorder radius="md" pos="relative" data-can-remove={!!onRemove}>
      {onRemove && (
        <UnstyledButton
          className={S.RemoveButton}
          onClick={onRemove}
          aria-label={t`Remove table`}
        >
          <Icon name="close" size={16} />
        </UnstyledButton>
      )}

      <Stack gap="lg" p="lg">
        <Box>
          <Text fw="bold" size="md" mb={4}>
            {t`Table`}
          </Text>
          <Text size="sm" c="text-secondary" mb="sm">
            {t`Will be visible to all tenant users`}
          </Text>

          <Flex
            component="button"
            type="button"
            className={S.PickerTrigger}
            onClick={openPicker}
            align="center"
            justify="space-between"
            w="100%"
            px="0.75rem"
            py="sm"
            bg="background-primary"
            bdrs="xs"
          >
            <Text
              c={selectedTableName ? "text-primary" : "text-tertiary"}
              size="md"
            >
              {selectedTableName ?? t`Pick a table`}
            </Text>

            <Icon name="chevrondown" size={16} />
          </Flex>

          <MiniPicker
            value={pickerValue}
            opened={isPickerOpen && !isBrowsing}
            onClose={closePicker}
            models={["table"]}
            onBrowseAll={handleBrowseAll}
            onChange={handleTableSelect}
            shouldShowLibrary={false}
            shouldHide={(item) => shouldHidePickerItem(item as MiniPickerItem)}
          />

          {isBrowsing && (
            <DataPickerModal
              title={t`Pick a table`}
              models={["table"]}
              onChange={handleModalSelect}
              onClose={closeBrowse}
              shouldDisableItem={shouldHidePickerItem}
              options={{
                hasLibrary: false,
                hasRootCollection: false,
                hasPersonalCollections: false,
              }}
            />
          )}
        </Box>

        <Box>
          <Text fw="bold" size="md" mb={4}>
            {t`Column to filter by`}
          </Text>

          <Text size="sm" c="text-secondary" mb="sm">
            {t`Tenant users will only see rows where this equals the tenant_identifier attribute.`}
          </Text>

          <Select
            placeholder={t`Pick a column`}
            data={columnOptions}
            value={selection.columnId ? String(selection.columnId) : null}
            onChange={handleColumnSelect}
            disabled={!selection.tableId || isLoadingTable}
            comboboxProps={{ position: "bottom" }}
          />
        </Box>
      </Stack>
    </Paper>
  );
};
