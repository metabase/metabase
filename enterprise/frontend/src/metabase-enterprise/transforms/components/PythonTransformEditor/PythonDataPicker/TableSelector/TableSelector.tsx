import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import type { CollectionPickerItem } from "metabase/common/components/Pickers/CollectionPicker";
import {
  type DataPickerItem,
  DataPickerModal,
} from "metabase/common/components/Pickers/DataPicker";
import { Button } from "metabase/ui";
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
  table,
}: {
  database: DatabaseId | undefined;
  table: Table | undefined;
  availableTables: Table[];
  selectedTableIds: Set<TableId | undefined>;
  disabled?: boolean;
  onChange: (table: Table | undefined) => void;
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
      return selectedTableIds.has(item.id);
    }
    if (item.model === "database") {
      return item.id !== database;
    }
    return true;
  }

  return (
    <>
      <Button
        className={S.tableSelector}
        onClick={open}
        flex="0 1 50%"
        disabled={disabled}
        fw="normal"
        classNames={{ inner: S.tableSelectorInner }}
      >
        {table?.display_name ?? t`Select a table…`}
      </Button>
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
