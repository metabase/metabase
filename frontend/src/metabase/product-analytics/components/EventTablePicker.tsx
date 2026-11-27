import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListTablesQuery } from "metabase/api";
import { DataPickerModal } from "metabase/common/components/Pickers";
import { canAccessDataStudio } from "metabase/common/data-studio/selectors";
import {
  EVENT_TABLE_ENTITY_TYPE,
  isEventTableSetUp,
} from "metabase/product-analytics-core";
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
import type { Table, TableId } from "metabase-types/api";

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
  table: Table | undefined;
  isLoading: boolean;
  /** Opens the picker on mount, for a page that has no table yet. */
  isInitiallyOpened: boolean;
  onChange: (tableId: TableId) => void;
};

/**
 * Offers the tables that are set up for product analysis, and searches them.
 * "Browse all" opens the full data picker, where someone who can set up a
 * table in Data Studio can pick any table, and anyone else only the set up
 * ones.
 */
export const EventTablePicker = ({
  table,
  isLoading,
  isInitiallyOpened,
  onChange,
}: EventTablePickerProps) => {
  const [isOpened, setIsOpened] = useState(isInitiallyOpened);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const tables = useListTablesQuery({ "entity-type": EVENT_TABLE_ENTITY_TYPE });
  const setUpTables = useMemo(
    () => (tables.data ?? []).filter(isEventTableSetUp),
    [tables.data],
  );
  const isSearching = searchQuery.trim().length > 0;
  const shownTables = isSearching
    ? setUpTables.filter((item) => matchesSearch(item, searchQuery))
    : setUpTables;
  // Data Studio access stands in for permission to edit a table's metadata.
  // Someone without it on the table they pick is told to ask an admin there.
  const canSetUpTables = useSelector(canAccessDataStudio);
  const pickerOptions = useMemo(
    () =>
      getEventTablePickerOptions({
        setUpTableIds: new Set(setUpTables.map((item) => item.id)),
        canSetUpTables,
      }),
    [setUpTables, canSetUpTables],
  );

  const close = () => {
    setIsOpened(false);
    setIsBrowsing(false);
    setSearchQuery("");
  };

  const handleOpenedChange = (opened: boolean) => {
    if (opened) {
      setIsOpened(true);
    } else {
      close();
    }
  };

  const handleChange = (tableId: TableId) => {
    close();
    onChange(tableId);
  };

  const pickerValue =
    table !== undefined
      ? { id: table.id, model: "table" as const, database_id: table.db_id }
      : undefined;

  return (
    <>
      <Menu
        opened={isOpened && !isBrowsing}
        onChange={handleOpenedChange}
        position="bottom-start"
        // The mini picker's width when it has a location column, as each row
        // here does.
        width="40rem"
        shadow="md"
        // The search box takes focus instead of the first item.
        trapFocus={false}
      >
        <Menu.Target>
          <Button
            variant="default"
            fw="bold"
            loading={isLoading}
            leftSection={<Icon name="database" />}
          >
            {table?.display_name ?? t`Pick a table`}
          </Button>
        </Menu.Target>
        <Menu.Dropdown px={0} py="sm">
          <Stack mah="60vh" gap={0}>
            <TextInput
              placeholder={t`Search for tables…`}
              aria-label={t`Search for tables`}
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
              {tables.error !== undefined && (
                <Text size="sm" c="text-secondary" px="md" py="sm">
                  {t`Couldn't load the event tables.`}
                </Text>
              )}
              {tables.isSuccess && shownTables.length === 0 && (
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
                  fw={item.id === table?.id ? "bold" : undefined}
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
          onChange={(item) => {
            if (item.model === "table") {
              handleChange(item.id);
            }
          }}
          onClose={close}
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
