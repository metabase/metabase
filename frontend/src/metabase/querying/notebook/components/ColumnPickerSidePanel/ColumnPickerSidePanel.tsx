import { DndContext, type DragEndEvent, closestCenter } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/common/components/MetadataInfo/ColumnInfoIcon";
import { Sidesheet } from "metabase/common/components/Sidesheet";
import { 
  ActionIcon,
  Box,
  Checkbox, 
  DelayGroup, 
  Flex,
  Icon, 
  Stack, 
  Text,
  TextInput
} from "metabase/ui";
import * as Lib from "metabase-lib";

import type { FieldPickerItem } from "../FieldPicker";
import S from "./ColumnPickerSidePanel.module.css";

interface SortableColumnItemProps {
  item: FieldPickerItem & { isSelected: boolean; isDisabled?: boolean };
  query: Lib.Query;
  stageIndex: number;
  displayName: string;
  onToggle: (column: Lib.ColumnMetadata, isSelected: boolean) => void;
  onDisplayNameChange: (column: Lib.ColumnMetadata, newDisplayName: string) => void;
}

function SortableColumnItem({
  item,
  query,
  stageIndex,
  displayName,
  onToggle,
  onDisplayNameChange,
}: SortableColumnItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState(displayName);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: item.columnInfo.longDisplayName,
    disabled: isEditing
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditingName(displayName);
  };

  const handleSaveEdit = () => {
    if (editingName.trim() && editingName !== displayName) {
      onDisplayNameChange(item.column, editingName.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditingName(displayName);
    setIsEditing(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      handleSaveEdit();
    } else if (event.key === "Escape") {
      handleCancelEdit();
    }
  };

  return (
    <li ref={setNodeRef} style={style} {...attributes}>
      <HoverParent className={S.Label} as="div">
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
          <Box flex={1}>
            {isEditing ? (
              <TextInput
                value={editingName}
                onChange={(event) => setEditingName(event.currentTarget.value)}
                onBlur={handleSaveEdit}
                onKeyDown={handleKeyDown}
                size="xs"
                autoFocus
                onFocus={(e) => e.target.select()}
              />
            ) : (
              <Text
                className={S.ItemTitle}
                onClick={handleStartEdit}
                style={{ cursor: "text" }}
                title={t`Click to edit display name`}
              >
                {displayName}
              </Text>
            )}
          </Box>
          <ActionIcon
            size="sm"
            variant="subtle"
            {...listeners}
            style={{ cursor: isDragging ? "grabbing" : "grab" }}
            aria-label={t`Drag to reorder`}
          >
            <Icon name="grabber" />
          </ActionIcon>
        </Flex>
      </HoverParent>
    </li>
  );
}

interface ColumnPickerSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  query: Lib.Query;
  stageIndex: number;
  columns: Lib.ColumnMetadata[];
  title?: string;
  "data-testid"?: string;
  isColumnSelected: (
    item: FieldPickerItem,
    items: FieldPickerItem[],
  ) => boolean;
  isColumnDisabled?: (
    item: FieldPickerItem,
    items: FieldPickerItem[],
  ) => boolean;
  onToggle: (column: Lib.ColumnMetadata, isSelected: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onReorderColumns?: (newOrder: Lib.ColumnMetadata[]) => void;
  onColumnDisplayNameChange?: (column: Lib.ColumnMetadata, newDisplayName: string) => void;
}

export const ColumnPickerSidePanel = ({
  isOpen,
  onClose,
  query,
  stageIndex,
  columns,
  title = t`Pick columns`,
  isColumnSelected,
  isColumnDisabled,
  onToggle,
  onSelectAll,
  onSelectNone,
  onReorderColumns,
  onColumnDisplayNameChange,
  ...props
}: ColumnPickerSidePanelProps) => {
  const [searchText, setSearchText] = useState("");
  const [columnDisplayNames, setColumnDisplayNames] = useState<Map<string, string>>(new Map());
  const [localColumns, setLocalColumns] = useState<Lib.ColumnMetadata[]>([]);

  // Update local columns when columns prop changes
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
      isDisabled: isColumnDisabled?.(item, items),
    }));
  }, [query, stageIndex, localColumns, isColumnSelected, isColumnDisabled]);

  const filteredItems = useMemo(() => {
    if (!searchText.trim()) {
      return items;
    }
    const searchLower = searchText.toLowerCase();
    return items.filter((item) => {
      const displayName = columnDisplayNames.get(item.columnInfo.longDisplayName) || item.columnInfo.displayName;
      return displayName.toLowerCase().includes(searchLower) ||
             item.columnInfo.longDisplayName.toLowerCase().includes(searchLower);
    });
  }, [items, searchText, columnDisplayNames]);

  const isAll = filteredItems.every((item) => item.isSelected);
  const isNone = filteredItems.every((item) => !item.isSelected);

  const handleLabelToggle = () => {
    if (isAll) {
      onSelectNone();
    } else {
      onSelectAll();
    }
  };

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    if (active.id !== over?.id && onReorderColumns) {
      // Find indices in the local columns
      const oldIndex = localColumns.findIndex((column) => {
        const info = Lib.displayInfo(query, stageIndex, column);
        return info.longDisplayName === active.id;
      });
      const newIndex = localColumns.findIndex((column) => {
        const info = Lib.displayInfo(query, stageIndex, column);
        return info.longDisplayName === over?.id;
      });
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedColumns = arrayMove(localColumns, oldIndex, newIndex);
        // Update local state immediately for instant UI feedback
        setLocalColumns(reorderedColumns);
        // Also notify parent component
        onReorderColumns(reorderedColumns);
      }
    }
  }, [localColumns, onReorderColumns, query, stageIndex]);

  const handleDisplayNameChange = useCallback((column: Lib.ColumnMetadata, newDisplayName: string) => {
    const columnInfo = Lib.displayInfo(query, stageIndex, column);
    setColumnDisplayNames(prev => new Map(prev.set(columnInfo.longDisplayName, newDisplayName)));
    onColumnDisplayNameChange?.(column, newDisplayName);
  }, [query, stageIndex, onColumnDisplayNameChange]);

  const getDisplayName = useCallback((item: FieldPickerItem) => {
    return columnDisplayNames.get(item.columnInfo.longDisplayName) || item.columnInfo.displayName;
  }, [columnDisplayNames]);

  return (
    <Sidesheet
      title={title}
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      withOverlay={false}
      data-testid={props["data-testid"]}
    >
      <Stack gap="md">
        {/* Search Box */}
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

        {/* Column List */}
        <Box className={S.ColumnsList}>
          <ul className={S.ItemList}>
            {/* Select All Toggle */}
            <li className={S.ToggleItem}>
              <HoverParent as="label" className={S.Label}>
                <Checkbox
                  variant="stacked"
                  checked={isAll}
                  indeterminate={!isAll && !isNone}
                  onChange={handleLabelToggle}
                />
                <div className={S.ItemTitle}>{t`Select all`}</div>
              </HoverParent>
            </li>

            {/* Sortable Column Items */}
            <DndContext
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={filteredItems.map((item) => item.columnInfo.longDisplayName)}
                strategy={verticalListSortingStrategy}
              >
                <DelayGroup>
                  {filteredItems.map((item) => (
                    <SortableColumnItem
                      key={item.columnInfo.longDisplayName}
                      item={item}
                      query={query}
                      stageIndex={stageIndex}
                      displayName={getDisplayName(item)}
                      onToggle={onToggle}
                      onDisplayNameChange={handleDisplayNameChange}
                    />
                  ))}
                </DelayGroup>
              </SortableContext>
            </DndContext>
          </ul>

          {filteredItems.length === 0 && searchText && (
            <Box p="md" ta="center">
              <Text c="dimmed">{t`No columns found matching "${searchText}"`}</Text>
            </Box>
          )}
        </Box>
      </Stack>
    </Sidesheet>
  );
}; 