import { useState } from "react";
import { t } from "ttag";

import { skipToken, useGetTableQuery, useListTablesQuery } from "metabase/api";
import { DataPickerModal } from "metabase/common/components/Pickers";
import { Button, Ellipsified, Icon, Loader, Menu, Text } from "metabase/ui";
import { isConcreteTableId } from "metabase-types/api";
import type { ConcreteTableId, TableId } from "metabase-types/api";

const EVENT_TABLE_ENTITY_TYPE = "entity/EventTable";

// The label is a flex item, so a long table name would push past the dropdown
// instead of truncating.
const ITEM_STYLES = { itemLabel: { minWidth: 0 } };

type EventTablePickerProps = {
  tableId: ConcreteTableId | undefined;
  /** Opens the picker on mount, for a page that has no table yet. */
  isInitiallyOpened?: boolean;
  onChange: (tableId: ConcreteTableId) => void;
};

/**
 * Offers the tables Metabase knows hold events first; "Browse all" opens the
 * full data picker for anything else.
 */
export const EventTablePicker = ({
  tableId,
  isInitiallyOpened = false,
  onChange,
}: EventTablePickerProps) => {
  const [isOpened, setIsOpened] = useState(isInitiallyOpened);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const table = useGetTableQuery(
    tableId !== undefined ? { id: tableId } : skipToken,
  );
  const tables = useListTablesQuery();
  const eventTables = (tables.data ?? []).filter(
    (item) =>
      item.entity_type === EVENT_TABLE_ENTITY_TYPE &&
      isConcreteTableId(item.id),
  );

  const handleChange = (id: TableId) => {
    if (isConcreteTableId(id)) {
      onChange(id);
    }
    setIsOpened(false);
    setIsBrowsing(false);
  };

  const label = table.data?.display_name ?? t`Pick a table`;
  const pickerValue =
    tableId !== undefined && table.data !== undefined
      ? {
          id: tableId,
          model: "table" as const,
          database_id: table.data.db_id,
        }
      : undefined;

  return (
    <>
      <Menu
        opened={isOpened && !isBrowsing}
        onChange={setIsOpened}
        position="bottom-start"
        width="target"
        shadow="md"
      >
        <Menu.Target>
          <Button
            variant="default"
            fw="bold"
            loading={table.isLoading}
            leftSection={<Icon name="database" />}
          >
            {label}
          </Button>
        </Menu.Target>
        <Menu.Dropdown miw="18rem" mah="60vh" style={{ overflowY: "auto" }}>
          <Menu.Label>{t`Event tables`}</Menu.Label>
          {tables.isLoading && <Loader size="xs" mx="md" my="sm" />}
          {!tables.isLoading && eventTables.length === 0 && (
            <Text size="sm" c="text-secondary" px="md" py="sm">
              {t`No tables are marked as event tables yet.`}
            </Text>
          )}
          {eventTables.map((item) => (
            <Menu.Item
              key={item.id}
              leftSection={<Icon name="table" />}
              rightSection={
                <Text size="sm" c="text-tertiary" maw="8rem" truncate>
                  {item.db?.name}
                </Text>
              }
              fw={item.id === tableId ? "bold" : undefined}
              styles={ITEM_STYLES}
              onClick={() => handleChange(item.id)}
            >
              <Ellipsified>{item.display_name}</Ellipsified>
            </Menu.Item>
          ))}
          <Menu.Divider />
          <Menu.Item
            leftSection={<Icon name="search" />}
            closeMenuOnClick={false}
            onClick={() => setIsBrowsing(true)}
          >
            {t`Browse all`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {isOpened && isBrowsing && (
        <DataPickerModal
          title={t`Pick a table`}
          value={pickerValue}
          models={["table"]}
          onChange={handleChange}
          onClose={() => {
            setIsBrowsing(false);
            setIsOpened(false);
          }}
        />
      )}
    </>
  );
};
