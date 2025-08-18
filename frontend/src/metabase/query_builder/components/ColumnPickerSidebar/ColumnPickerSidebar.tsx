import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/common/components/MetadataInfo/ColumnInfoIcon";
import { Sidesheet } from "metabase/common/components/Sidesheet";
import type { FieldPickerItem } from "metabase/querying/notebook/components/FieldPicker";
import {
  ActionIcon,
  Box,
  Checkbox,
  Flex,
  Icon,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./ColumnPickerSidebar.module.css";

interface ColumnPickerSidebarProps {
  query: Lib.Query;
  stageIndex: number;
  title?: string;
  isOpen: boolean;
  onClose: () => void;
  columns: Lib.ColumnMetadata[];
  isColumnSelected: (
    column: FieldPickerItem,
    columns: FieldPickerItem[],
  ) => boolean;
  isColumnDisabled?: (
    column: FieldPickerItem,
    columns: FieldPickerItem[],
  ) => boolean;
  onToggle: (column: Lib.ColumnMetadata, isSelected: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}

export function ColumnPickerSidebar({
  query,
  stageIndex,
  isOpen,
  title,
  columns,
  onClose,
  isColumnSelected,
  isColumnDisabled,
  onToggle,
  onSelectAll,
  onSelectNone,
}: ColumnPickerSidebarProps) {
  const [localColumns, setLocalColumns] = useState<Lib.ColumnMetadata[]>([]);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    setLocalColumns(columns);
  }, [columns]);

  const items = useMemo(() => {
    const items = localColumns.map((column) => ({
      column,
      columnInfo: Lib.displayInfo(query, stageIndex, column),
    }));

    return items.map((item) => ({
      ...item,
      isSelected: isColumnSelected(item, items),
      isDisabled: isColumnDisabled?.(item, items) ?? false,
    }));
  }, [query, stageIndex, localColumns, isColumnSelected, isColumnDisabled]);

  const filteredItems = useMemo(() => {
    if (!searchText.trim()) {
      return items;
    }
    const searchLower = searchText.toLowerCase();
    return items.filter((item) => {
      const displayName = item.columnInfo.displayName.toLowerCase();
      const longDisplayName = item.columnInfo.longDisplayName.toLowerCase();

      return (
        displayName.includes(searchLower) ||
        longDisplayName.includes(searchLower)
      );
    });
  }, [items, searchText]);

  const isAll = filteredItems.every((item) => item.isSelected);
  const isNone = filteredItems.every((item) => !item.isSelected);

  const handleAllToggle = () => {
    if (isAll) {
      onSelectNone();
    } else {
      onSelectAll();
    }
  };

  return (
    <Sidesheet
      title={title ?? t`Pick Columns`}
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      withOverlay={false}
    >
      <Stack gap="md">
        <TextInput
          placeholder={t`Search columns...`}
          value={searchText}
          onChange={(event) => setSearchText(event.currentTarget.value)}
          leftSection={<Icon name="search" />}
          rightSection={
            searchText && (
              <ActionIcon
                size="xs"
                variant="subtle"
                onClick={() => setSearchText("")}
                aria-label={t`Clear search`}
              >
                <Icon name="close" />
              </ActionIcon>
            )
          }
        />

        <Box className={S.ColumnsList}>
          <ul className={S.ItemList}>
            <li className={S.ToggleItem}>
              <HoverParent as="label" className={S.Label}>
                <Checkbox
                  variant="stacked"
                  checked={isAll}
                  indeterminate={!isAll && !isNone}
                  onChange={handleAllToggle}
                />
                <div className={S.ItemTitle}>
                  {searchText ? t`Select these` : t`Select all`}
                </div>
              </HoverParent>
            </li>

            {filteredItems.map((item) => {
              return (
                <ColumnPickerItem
                  key={item.columnInfo.displayName}
                  item={item}
                  query={query}
                  stageIndex={stageIndex}
                  onToggle={onToggle}
                />
              );
            })}
          </ul>

          {filteredItems.length === 0 && searchText && (
            <Box p="md" ta="center">
              <Text>{t`No columns found matching "${searchText}"`}</Text>
            </Box>
          )}
        </Box>
      </Stack>
    </Sidesheet>
  );
}

interface ColumnPickerItemProps {
  query: Lib.Query;
  stageIndex: number;
  item: FieldPickerItem & { isSelected: boolean; isDisabled: boolean };
  onToggle: (column: Lib.ColumnMetadata, isSelected: boolean) => void;
}

function ColumnPickerItem({
  query,
  stageIndex,
  item,
  onToggle,
}: ColumnPickerItemProps) {
  return (
    <li key={item.columnInfo.displayName}>
      <HoverParent className={S.Label} as="label">
        <Flex align="center" gap="xs" w="100%">
          <Checkbox
            checked={item.isSelected}
            disabled={item.isDisabled}
            onChange={(event) => onToggle(item.column, event.target.checked)}
          />
          <QueryColumnInfoIcon
            className={S.ItemIcon}
            query={query}
            stageIndex={stageIndex}
            column={item.column}
            position="top-start"
            size={16}
          />
          {/* <Box flex={1}> */}
          <Text title={t`Click to edit display name`}>
            {item.columnInfo.longDisplayName}
          </Text>
          {/* </Box> */}
        </Flex>
      </HoverParent>
    </li>
  );
}
