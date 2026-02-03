import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import type { OmniPickerItem } from "metabase/common/components/Pickers";
import {
  DataPickerModal,
  type DataPickerValue,
} from "metabase/common/components/Pickers/DataPicker";
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

  function shouldDisableItem(item: OmniPickerItem) {
    if (item.model === "table") {
      // Filter available tables to exclude already selected ones (except current selection)
      return !isConcreteTableId(item.id) || selectedTableIds.includes(item.id);
    }
    return false;
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

<<<<<<< HEAD
        <Tooltip label={t`Remove this table`}>
          <ActionIcon
            disabled={disabled}
            onClick={onRemove}
            pr="sm"
            aria-label={t`Remove this table`}
          >
            <Icon name="close" c="text-primary" />
          </ActionIcon>
        </Tooltip>
=======
        {!disabled && (
          <Tooltip label={t`Remove this table`}>
            <ActionIcon
              onClick={onRemove}
              pr="sm"
              aria-label={t`Remove this table`}
            >
              <Icon name="close" c="text-primary" />
            </ActionIcon>
          </Tooltip>
        )}
>>>>>>> master
      </Group>
      {isOpened && (
        <DataPickerModal
          title={t`Pick a table`}
          value={getDataPickerValue(table) ?? getDefaultDatabase(database)}
          onlyDatabaseId={database}
          onChange={handleChange}
          onClose={close}
          shouldDisableItem={shouldDisableItem}
          models={["table"]}
          options={{
            hasLibrary: false,
            hasDatabases: true,
            hasRootCollection: false,
            hasPersonalCollections: false,
          }}
        />
      )}
    </>
  );
}

function getDefaultDatabase(dbId?: DatabaseId): DataPickerValue | undefined {
  if (!dbId) {
    return;
  }
  return {
    model: "database",
    id: dbId,
  };
}

function getDataPickerValue(
  table: Table | undefined,
): DataPickerValue | undefined {
  if (!table) {
    return;
  }
  return {
    model: "table",
    id: table.id,
  };
}
