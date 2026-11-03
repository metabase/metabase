import { useMemo, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetTableQuery, useListTablesQuery } from "metabase/api";
import { DataPickerModal } from "metabase/common/components/Pickers";
import { canAccessDataStudio } from "metabase/common/data-studio/selectors";
import {
  EVENT_TABLE_ENTITY_TYPE,
  isEventTableSetUp,
} from "metabase/event-tables";
import { useSelector } from "metabase/redux";
import {
  Box,
  Button,
  Ellipsified,
  Icon,
  Loader,
  Menu,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import { isConcreteTableId } from "metabase-types/api";
import type { ConcreteTableId, Table, TableId } from "metabase-types/api";

import S from "./EventTablePicker.module.css";
import { getEventTablePickerOptions } from "./event-table-picker-options";

const ITEM_CLASS_NAMES = {
  itemLabel: S.itemLabel,
  itemSection: S.itemSection,
};

const getTableLocation = (table: Table) =>
  table.schema ? `${table.db?.name} (${table.schema})` : table.db?.name;

const matchesSearch = (table: Table, searchQuery: string) => {
  const query = searchQuery.trim().toLowerCase();
  return [table.display_name, table.name].some((name) =>
    name.toLowerCase().includes(query),
  );
};

type EventTablePickerProps = {
  tableId: ConcreteTableId | undefined;
  /** Opens the picker on mount, for a page that has no table yet. */
  isInitiallyOpened?: boolean;
  onChange: (tableId: ConcreteTableId) => void;
};

/**
 * Offers the tables that are set up for product analysis, and searches them.
 * "Browse all" opens the full data picker, where someone who can set up a
 * table in Data Studio can pick any table, and anyone else only the set up
 * ones.
 */
export const EventTablePicker = ({
  tableId,
  isInitiallyOpened = false,
  onChange,
}: EventTablePickerProps) => {
  const [isOpened, setIsOpened] = useState(isInitiallyOpened);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const table = useGetTableQuery(
    tableId !== undefined ? { id: tableId } : skipToken,
  );
  const tables = useListTablesQuery({ "entity-type": EVENT_TABLE_ENTITY_TYPE });
  const setUpTables = useMemo(
    () =>
      (tables.data ?? []).filter(
        (item) => isConcreteTableId(item.id) && isEventTableSetUp(item),
      ),
    [tables.data],
  );
  const isSearching = searchQuery.trim().length > 0;
  const shownTables = isSearching
    ? setUpTables.filter((item) => matchesSearch(item, searchQuery))
    : setUpTables;
  // Analysts may lack metadata permissions on some tables. Checking each
  // table costs a slow request, so their setup screen says to ask an admin.
  const canSetUpTables = useSelector(canAccessDataStudio);
  const pickerOptions = useMemo(
    () =>
      getEventTablePickerOptions({
        setUpTableIds: new Set(setUpTables.map((item) => item.id)),
        canSetUpTables,
      }),
    [setUpTables, canSetUpTables],
  );

  const handleOpenedChange = (opened: boolean) => {
    setIsOpened(opened);
    if (!opened) {
      setSearchQuery("");
    }
  };

  const handleChange = (id: TableId) => {
    if (isConcreteTableId(id)) {
      onChange(id);
    }
    setIsOpened(false);
    setIsBrowsing(false);
    setSearchQuery("");
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
        onChange={handleOpenedChange}
        position="bottom-start"
        // Matches the mini picker's width when it shows its location column,
        // which both lists here always do.
        width="40rem"
        shadow="md"
        // The search box takes focus instead of the first item.
        trapFocus={false}
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
        <Menu.Dropdown px={0} py="sm">
          <Stack mah="60vh" gap={0}>
            <TextInput
              placeholder={t`Search for tables…`}
              value={searchQuery}
              leftSection={<Icon name="search" />}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              autoFocus
              px="sm"
              pt="2px"
              pb="sm"
            />
            <Menu.Divider mx="sm" />
            <Box px="sm" style={{ overflowY: "auto" }}>
              <Menu.Label>{t`Event tables`}</Menu.Label>
              {tables.isLoading && <Loader size="xs" mx="md" my="sm" />}
              {!tables.isLoading && shownTables.length === 0 && (
                <Text size="sm" c="text-secondary" px="md" py="sm">
                  {getEmptyMessage({ isSearching, canSetUpTables })}
                </Text>
              )}
              {shownTables.map((item) => (
                <Menu.Item
                  key={item.id}
                  leftSection={<Icon name="table" />}
                  rightSection={
                    <Text size="sm" c="text-secondary" miw={0}>
                      <Ellipsified>{getTableLocation(item)}</Ellipsified>
                    </Text>
                  }
                  fw={item.id === tableId ? "bold" : undefined}
                  classNames={ITEM_CLASS_NAMES}
                  onClick={() => handleChange(item.id)}
                >
                  <Ellipsified>{item.display_name}</Ellipsified>
                </Menu.Item>
              ))}
            </Box>
            <Menu.Divider mx="sm" />
            <Box px="sm">
              <Menu.Item
                leftSection={<Icon name="search" />}
                closeMenuOnClick={false}
                onClick={() => setIsBrowsing(true)}
              >
                {t`Browse all`}
              </Menu.Item>
            </Box>
          </Stack>
        </Menu.Dropdown>
      </Menu>
      {isOpened && isBrowsing && (
        <DataPickerModal
          title={t`Pick a table`}
          value={pickerValue}
          models={["table"]}
          shouldDisableItem={pickerOptions.shouldDisableItem}
          options={pickerOptions.options}
          onChange={handleChange}
          onClose={() => {
            setIsBrowsing(false);
            setIsOpened(false);
            setSearchQuery("");
          }}
        />
      )}
    </>
  );
};

type EmptyMessageOptions = {
  isSearching: boolean;
  canSetUpTables: boolean;
};

const getEmptyMessage = ({
  isSearching,
  canSetUpTables,
}: EmptyMessageOptions): string => {
  if (isSearching) {
    return t`No event tables match your search.`;
  }
  return canSetUpTables
    ? t`No tables are set up for product analysis yet. Browse all tables to pick one to set up.`
    : t`No tables are set up for product analysis yet. Ask an admin to set one up in Data Studio.`;
};
