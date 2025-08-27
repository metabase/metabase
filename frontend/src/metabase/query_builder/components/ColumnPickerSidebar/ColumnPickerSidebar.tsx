import { DndContext, type DragEndEvent, closestCenter } from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { forwardRef, useEffect, useMemo, useState } from "react";
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
  onToggle?: (column: Lib.ColumnMetadata, isSelected: boolean) => void;
  onSelectAll?: () => void;
  onSelectNone?: () => void;
  isColumnSelected?: (column: FieldPickerItem) => boolean;
  isDraggable?: boolean;
  onReorderColumns?: (oldIndex: number, newIndex: number) => void;
}

export function ColumnPickerSidebar({
  query,
  stageIndex,
  isOpen,
  title,
  columns,
  onClose,
  onToggle,
  onSelectAll,
  onSelectNone,
  isColumnSelected = _isColumnSelected,
  isDraggable = false,
  onReorderColumns,
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
      isSelected: isColumnSelected(item),
      isDisabled: isColumnDisabled?.(item, items) ?? false,
    }));
  }, [localColumns, query, stageIndex, isColumnSelected]);

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
      onSelectNone?.();
    } else {
      onSelectAll?.();
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id && onReorderColumns) {
      const oldIndex = localColumns.findIndex((column) => {
        const info = Lib.displayInfo(query, stageIndex, column);
        return info.longDisplayName === active.id;
      });
      const newIndex = localColumns.findIndex((column) => {
        const info = Lib.displayInfo(query, stageIndex, column);
        return info.longDisplayName === over?.id;
      });

      if (oldIndex !== -1 && newIndex !== -1) {
        // reorder columns in viz settings
        onReorderColumns(oldIndex, newIndex);
      }
    }
  };

  const ItemComponent = isDraggable
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
                items={filteredItems.map((item) => item.columnInfo.displayName)}
                strategy={verticalListSortingStrategy}
              >
                {filteredItems.map((item) => {
                  return (
                    <ItemComponent
                      key={item.columnInfo.displayName}
                      item={item}
                      query={query}
                      stageIndex={stageIndex}
                      onToggle={onToggle}
                      isDraggable={isDraggable}
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

interface ColumnPickerItemProps {
  query: Lib.Query;
  stageIndex: number;
  item: FieldPickerItem & { isSelected: boolean; isDisabled: boolean };
  onToggle?: (column: Lib.ColumnMetadata, isSelected: boolean) => void;
  isDraggable: boolean;
  handle?: React.ReactNode;
  style?: React.CSSProperties;
}

const ColumnPickerItem = forwardRef<HTMLLIElement, ColumnPickerItemProps>(
  function ColumnPickerItem(
    { query, stageIndex, item, onToggle, isDraggable, handle, ...rest },
    ref,
  ) {
    const [editingName, setEditingName] = useState(
      item.columnInfo.longDisplayName,
    );

    return (
      <li key={item.columnInfo.displayName} ref={ref} {...rest}>
        <HoverParent className={S.Label} as="label">
          <Flex align="center" gap="xs" w="100%">
            {isDraggable && handle}
            {!isDraggable && (
              <Checkbox
                checked={item.isSelected}
                disabled={item.isDisabled}
                onChange={(event) =>
                  onToggle?.(item.column, event.target.checked)
                }
              />
            )}
            {!isDraggable && (
              <QueryColumnInfoIcon
                className={S.ItemIcon}
                query={query}
                stageIndex={stageIndex}
                column={item.column}
                position="top-start"
                size={16}
              />
            )}
            <Box flex={1}>
              {isDraggable ? (
                <TextInput
                  value={editingName}
                  onChange={(event) =>
                    setEditingName(event.currentTarget.value)
                  }
                  size="md"
                  autoFocus
                  onFocus={(e) => e.target.select()}
                />
              ) : (
                <Text title={t`Click to edit display name`}>
                  {item.columnInfo.longDisplayName}
                </Text>
              )}
            </Box>
          </Flex>
        </HoverParent>
      </li>
    );
  },
);

function SortableColumnPickerItem(
  props: Omit<ColumnPickerItemProps, "handle" | "style">,
) {
  const { item } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.columnInfo.displayName,
    disabled: !item.isSelected,
  });

  const Handle = () => {
    return (
      <ActionIcon
        size="sm"
        variant="subtle"
        {...listeners}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
        aria-label={t`Drag to reorder`}
      >
        <Icon name="grabber" />
      </ActionIcon>
    );
  };

  return (
    <ColumnPickerItem
      {...props}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      {...attributes}
      handle={<Handle />}
    />
  );
}

function _isColumnSelected({ columnInfo }: FieldPickerItem) {
  return Boolean(columnInfo.selected);
}

function isColumnDisabled(item: FieldPickerItem, items: FieldPickerItem[]) {
  const isSelected = _isColumnSelected(item);
  const isOnlySelected = items.filter(_isColumnSelected).length === 1;
  return isSelected && isOnlySelected;
}
