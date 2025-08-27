import { DndContext, type DragEndEvent, closestCenter } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { HoverParent } from "metabase/common/components/MetadataInfo/ColumnInfoIcon";
import { Sidesheet } from "metabase/common/components/Sidesheet";
import type { FieldPickerItem } from "metabase/querying/notebook/components/FieldPicker";
import {
  ActionIcon,
  Box,
  Checkbox,
  Icon,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { VisualizationSettings } from "metabase-types/api";

import { ColumnPickerItem } from "./ColumnPickerItem";
import S from "./ColumnPickerSidebar.module.css";
import { SortableColumnPickerItem } from "./SortableColumnPickerItem";

interface ColumnPickerSidebarProps {
  query: Lib.Query;
  stageIndex: number;
  title?: string;
  isOpen: boolean;
  onClose: () => void;
  columns: Lib.ColumnMetadata[];
  onToggle?: (column: Lib.ColumnMetadata, isSelected: boolean) => void;
  onToggleSome?: (columns: Lib.ColumnMetadata[], isSelected: boolean) => void;
  onSelectAll?: () => void;
  onSelectNone?: () => void;
  isColumnSelected?: (item: FieldPickerItem) => boolean;
  isDraggable?: boolean;
  onReorderColumns?: (oldIndex: number, newIndex: number) => void;
  onColumnDisplayNameChange?: (
    column: Lib.ColumnMetadata,
    displayName: string,
  ) => void;
  visualizationSettings?: VisualizationSettings;
}

export function ColumnPickerSidebar({
  query,
  stageIndex,
  isOpen,
  title,
  columns,
  onClose,
  onToggle,
  onToggleSome,
  onSelectAll,
  onSelectNone,
  isColumnSelected = _isColumnSelected,
  isDraggable = false,
  onReorderColumns,
  onColumnDisplayNameChange,
  visualizationSettings,
}: ColumnPickerSidebarProps) {
  const [searchText, setSearchText] = useState("");
  const [columnDisplayNames, setColumnDisplayNames] = useState<
    Map<string, string>
  >(new Map());

  useEffect(() => {
    if (!visualizationSettings) {
      return;
    }

    const settings = visualizationSettings["column_settings"] ?? {};
    const nameTylpes = Object.keys(settings);

    if (nameTylpes.length > 0) {
      const names = nameTylpes.map((entry) => {
        const [, name] = JSON.parse(entry);

        return [name, (settings[entry] ?? {}).column_title];
      });

      setColumnDisplayNames(
        new Map(names.map(([name, value]) => [name, value])),
      );
    }
  }, [visualizationSettings, columns]);

  const items = useMemo(() => {
    const items = columns.map((column) => ({
      column,
      columnInfo: Lib.displayInfo(query, stageIndex, column),
    }));

    return items.map((item) => ({
      ...item,
      isSelected: isColumnSelected(item),
      isDisabled: isColumnDisabled?.(item, items) ?? false,
    }));
  }, [columns, query, stageIndex, isColumnSelected]);

  const filteredItems = useMemo(() => {
    if (!searchText.trim()) {
      return items;
    }
    const searchLower = searchText.toLowerCase();
    return items.filter((item) => {
      const displayName =
        columnDisplayNames.get(item.columnInfo.name) ??
        item.columnInfo.displayName.toLowerCase();
      const longDisplayName = item.columnInfo.longDisplayName.toLowerCase();

      return (
        displayName.includes(searchLower) ||
        longDisplayName.includes(searchLower)
      );
    });
  }, [columnDisplayNames, items, searchText]);

  const isAll = filteredItems.every((item) => item.isSelected);
  const isNone = filteredItems.every((item) => !item.isSelected);

  const handleAllToggle = () => {
    const isFiltered = searchText.trim();

    if (isAll) {
      if (isFiltered) {
        onToggleSome?.(
          filteredItems.map((item) => item.column),
          false,
        );
      } else {
        onSelectNone?.();
      }
    } else {
      if (isFiltered) {
        onToggleSome?.(
          filteredItems.map((item) => item.column),
          true,
        );
      } else {
        onSelectAll?.();
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id && onReorderColumns) {
      const oldIndex = columns.findIndex((column) => {
        const info = Lib.displayInfo(query, stageIndex, column);
        return info.longDisplayName === active.id;
      });
      const newIndex = columns.findIndex((column) => {
        const info = Lib.displayInfo(query, stageIndex, column);
        return info.longDisplayName === over?.id;
      });

      if (oldIndex !== -1 && newIndex !== -1) {
        onReorderColumns(oldIndex, newIndex);
      }
    }
  };

  const handleDisplayNameChange = useCallback(
    (column: Lib.ColumnMetadata, newDisplayName: string) => {
      const columnInfo = Lib.displayInfo(query, stageIndex, column);
      setColumnDisplayNames(
        (prev) => new Map(prev.set(columnInfo.name, newDisplayName)),
      );
      onColumnDisplayNameChange?.(column, newDisplayName);
    },
    [onColumnDisplayNameChange, query, stageIndex],
  );

  const getDisplayName = useCallback(
    (item: FieldPickerItem) => {
      return (
        columnDisplayNames.get(item.columnInfo.name) ??
        item.columnInfo.longDisplayName
      );
    },
    [columnDisplayNames],
  );

  const ItemComponent =
    isDraggable && columns.length > 1 && !searchText.trim()
      ? SortableColumnPickerItem
      : ColumnPickerItem;

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
            {!isDraggable && (
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
            )}

            <DndContext
              onDragEnd={handleDragEnd}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext
                items={filteredItems.map(
                  (item) => item.columnInfo.longDisplayName,
                )}
                strategy={verticalListSortingStrategy}
              >
                {filteredItems.map((item) => {
                  return (
                    <ItemComponent
                      key={item.columnInfo.longDisplayName}
                      item={item}
                      query={query}
                      stageIndex={stageIndex}
                      onToggle={onToggle}
                      isDraggable={isDraggable}
                      displayName={getDisplayName(item)}
                      onDisplayNameChange={handleDisplayNameChange}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
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

function _isColumnSelected(item: FieldPickerItem) {
  return Boolean(item.columnInfo.selected);
}

function isColumnDisabled(item: FieldPickerItem, items: FieldPickerItem[]) {
  const isSelected = _isColumnSelected(item);
  const isOnlySelected = items.filter(_isColumnSelected).length === 1;
  return isSelected && isOnlySelected;
}
