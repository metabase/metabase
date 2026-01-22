import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import type { CollectionPickerItem } from "metabase/common/components/Pickers/CollectionPicker";
import {
  type DataPickerItem,
  DataPickerModal,
} from "metabase/common/components/Pickers/DataPicker";
import type { TablePickerValue } from "metabase/common/components/Pickers/TablePicker";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Stack,
  Tooltip,
} from "metabase/ui";
import type {
  ConcreteTableId,
  DatabaseId,
  RecentItem,
  Table,
  TableId,
} from "metabase-types/api";
import { isConcreteTableId } from "metabase-types/api";

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
  selectedTableIds: ConcreteTableId[];
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
      return !isConcreteTableId(item.id) || selectedTableIds.includes(item.id);
    }
    if (item.model === "database") {
      return item.id !== database;
    }
    if (item.model === "collection" && item.id === "databases") {
      return false;
    }
    return true;
  }

  return (
    <>
      <Group w="100%" bdrs="xs" gap="xs" className={S.tableSelector}>
        <Button
          flex="1 1 auto"
          onClick={open}
          disabled={disabled}
          classNames={{ inner: S.tableSelectorButtonInner }}
          px="sm"
          py="lg"
          variant="subtle"
        >
          <Stack gap={0} align="start" justify="center">
            {table ? (
              <>
                <Box fz="sm" c="text-secondary" fw="normal">
                  {table?.db?.name} / {table?.schema}
                </Box>
                <Box c="text-primary">{table?.display_name}</Box>
              </>
            ) : (
              <Box c="text-primary">{t`Select a table…`}</Box>
            )}
          </Stack>
        </Button>

        <Tooltip label={t`Remove this table`}>
          <ActionIcon
            onClick={onRemove}
            pr="sm"
            aria-label={t`Remove this table`}
          >
            <Icon name="close" c="text-primary" />
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
          models={["table"]}
          options={{
            showLibrary: false,
            showRootCollection: false,
            showPersonalCollections: false,
          }}
        />
      )}
    </>
  );
}

function getDataPickerValue(
  table: Table | undefined,
): TablePickerValue | undefined {
  if (!table) {
    return;
  }
  return {
    model: "table",
    id: table.id,
    name: table.display_name,
    db_id: table.db_id,
    schema: table.schema,
  };
}
