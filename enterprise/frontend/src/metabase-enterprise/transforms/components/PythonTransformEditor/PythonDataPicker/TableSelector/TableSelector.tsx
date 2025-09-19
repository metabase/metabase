import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import type { CollectionPickerItem } from "metabase/common/components/Pickers/CollectionPicker";
import {
  type DataPickerItem,
  DataPickerModal,
} from "metabase/common/components/Pickers/DataPicker";
import {
  ActionIcon,
  Button,
  Group,
  Icon,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type {
  DatabaseId,
  RecentItem,
  Table,
  TableId,
} from "metabase-types/api";

import S from "./TableSelector.module.css";

export function TableSelector({
  database,
  availableTables,
  selectedTableIds,
  disabled,
  onChange,
  onRemove,
  table,
}: {
  database: DatabaseId | undefined;
  table: Table | undefined;
  availableTables: Table[];
  selectedTableIds: TableId[];
  disabled?: boolean;
  onChange: (table: Table | undefined) => void;
  onRemove: () => void;
}) {
  const [isOpened, { open, close }] = useDisclosure();

  function handleChange(tableId: TableId | undefined) {
    const table = availableTables.find((table) => table.id === tableId);
    if (table) {
      onChange(table);
    }
  }

  function shouldDisableItem(
    item: DataPickerItem | CollectionPickerItem | RecentItem,
  ) {
    if (item.model === "table") {
      // Filter available tables to exclude already selected ones (except current selection)
      return selectedTableIds.includes(item.id);
    }
    if (item.model === "database") {
      return item.id !== database;
    }
    return true;
  }

  return (
    <>
      <Group w="100%" bdrs="xs" gap="xs" p="sm" className={S.tableSelector}>
        <Button
          flex="1 1 auto"
          onClick={open}
          disabled={disabled}
          classNames={{ inner: S.tableSelectorInner }}
          p={0}
          variant="subtle"
        >
          <Stack gap={0} align="start" justify="center">
            {table ? (
              <>
                <Text size="sm" c="text-medium" fw="normal">
                  {table?.db?.name} / {table?.schema}
                </Text>
                <Text>{table?.display_name}</Text>
              </>
            ) : (
              <Text>{t`Select a table…`}</Text>
            )}
          </Stack>
        </Button>

        <Tooltip label={t`Remove this table`}>
          <ActionIcon onClick={onRemove}>
            <Icon name="close" c="text-dark" />
          </ActionIcon>
        </Tooltip>
      </Group>
      {isOpened && (
        <DataPickerModal
          title={t`Pick a table`}
          value={getDataPickerValue(table)}
          databaseId={database}
          onChange={handleChange}
          onClose={close}
          shouldDisableItem={shouldDisableItem}
        />
      )}
    </>
  );
}

function getDataPickerValue(table: Table | undefined) {
  if (!table) {
    return undefined;
  }
  return {
    model: "table" as const,
    id: table.id,
    name: table.display_name,
    db_id: table.db_id,
    schema: table.schema,
  };
}
