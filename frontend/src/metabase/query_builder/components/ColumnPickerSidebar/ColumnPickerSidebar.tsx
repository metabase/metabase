import { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
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
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { VisualizationSettings } from "metabase-types/api";

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
  onColumnDisplayNameChange: (
    column: Lib.ColumnMetadata,
    newDisplayName: string,
  ) => void;
  onReorderColumns?: (columns: Lib.ColumnMetadata[]) => void;
  visualizationSettings: VisualizationSettings;
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
  onColumnDisplayNameChange,
  onReorderColumns,
  visualizationSettings,
}: ColumnPickerSidebarProps) {
  const [localColumns, setLocalColumns] = useState<Lib.ColumnMetadata[]>([]);
  const [searchText, setSearchText] = useState("");
  const [columnDisplayNames, setColumnDisplayNames] = useState<
    Map<string, string>
  >(new Map());

  useEffect(() => {
    setLocalColumns(columns);
  }, [columns]);

  useEffect(() => {
    const settings = visualizationSettings["column_settings"] ?? {};
    const nameTylpes = Object.keys(settings);

    if (nameTylpes.length > 0) {
      const names = nameTylpes.map((entry) => {
        const [, name] = JSON.parse(entry);


        return [name, (settings[entry] ?? {}).column_title];
      });

      setColumnDisplayNames(new Map(names.map(([name, value]) => [name, value])))
    }
  }, [visualizationSettings, columns]);

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
  }, [localColumns, query, stageIndex, isColumnSelected, isColumnDisabled]);

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
    if (isAll) {
      onSelectNone();
    } else {
      onSelectAll();
    }
  };

  const handleDisplayNameChange = useCallback(
    (column: Lib.ColumnMetadata, newDisplayName: string) => {
      const columnInfo = Lib.displayInfo(query, stageIndex, column);
      setColumnDisplayNames(
        (prev) => new Map(prev.set(columnInfo.name, newDisplayName)),
      );
      onColumnDisplayNameChange(column, newDisplayName);
    },
    [onColumnDisplayNameChange, query, stageIndex],
  );

  const getDisplayName = useCallback(
    (item: FieldPickerItem) => {
      return (
        columnDisplayNames.get(item.columnInfo.name) ||
        item.columnInfo.displayName
      );
    },
    [columnDisplayNames],
  );

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
        const reorderedColumns = arrayMove(localColumns, oldIndex, newIndex);
        // setLocalColumns(reorderedColumns);
        onReorderColumns(reorderedColumns);
      }
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

            <DndContext onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
              <SortableContext
                items={filteredItems.map((item) => item.columnInfo.displayName)}
                strategy={verticalListSortingStrategy}
              >
                {filteredItems.map((item) => {
                  return (
                    <SortableColumnPickerItem
                      key={item.columnInfo.displayName}
                      item={item}
                      query={query}
                      stageIndex={stageIndex}
                      onToggle={onToggle}
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

interface ColumnPickerItemProps {
  query: Lib.Query;
  stageIndex: number;
  item: FieldPickerItem & { isSelected: boolean; isDisabled: boolean };
  onToggle: (column: Lib.ColumnMetadata, isSelected: boolean) => void;
  displayName: string;
  onDisplayNameChange: (
    column: Lib.ColumnMetadata,
    newDisplayName: string,
  ) => void;
  style: React.CSSProperties;
  handle: React.ReactNode;
}

const ColumnPickerItem = forwardRef<HTMLLIElement, ColumnPickerItemProps>(function ColumnPickerItem(props, ref) {
  const { query, stageIndex, item, displayName, onToggle, onDisplayNameChange, style, handle, ...rest } = props;
  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState(displayName);

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
    event.stopPropagation();
    if (event.key === "Enter") {
      handleSaveEdit();
    } else if (event.key === "Escape") {
      handleCancelEdit();
    }
  };

  return (
    <li key={item.columnInfo.displayName} ref={ref} style={style} {...rest}>
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
                size="md"
                autoFocus
                onFocus={(e) => e.target.select()}
              />
            ) : (
              <Text
                title={t`Click to edit display name`}
                onDoubleClick={handleStartEdit}
              >
                {displayName ?? item.columnInfo.longDisplayName}
              </Text>
            )}
          </Box>
          {handle}
        </Flex>
      </HoverParent>
    </li>
  );
});

function SortableColumnPickerItem(props: Omit<ColumnPickerItemProps, "handle" | "style">) {
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
    return <ActionIcon
      size="sm"
      variant="subtle"
      {...listeners}
      style={{ cursor: isDragging ? "grabbing" : "grab" }}
      aria-label={t`Drag to reorder`}
    >
      <Icon name="grabber" />
    </ActionIcon>
  }

  return <ColumnPickerItem {...props} ref={setNodeRef} style={{
    transform: CSS.Transform.toString(transform), transition,
    opacity: isDragging ? 0.5 : 1,
  }} {...attributes} handle={<Handle />} />
}
