import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { arrayMove } from "@dnd-kit/sortable";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  ReorderableTagsInput,
  SortablePill,
} from "metabase/common/components/ReorderableTagsInput/ReorderableTagsInput";
import { getColumnExample } from "metabase/query_builder/components/expressions/CombineColumns/util";
import {
  ActionIcon,
  Box,
  Divider,
  Icon,
  type IconName,
  Menu,
  Stack,
  Text,
} from "metabase/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type * as Lib from "metabase-lib";
import type { DatasetColumn, DatasetData, RowValues } from "metabase-types/api";

import { ENTITY_ICONS, getEntityIcon, useListColumns } from "./ListView";
import S from "./ListView.module.css";
import { ListViewItem } from "./ListViewItem";

const formatEntityIconName = (key: string): string => {
  return key
    .replace("entity/", "")
    .replace("Table", "")
    .replace(/([A-Z])/g, " $1")
    .trim();
};

const MAX_LEFT_COLUMNS = 2;
const MAX_RIGHT_COLUMNS = 5;
type ContainerId = "left" | "right";

export const ListViewConfiguration = ({
  data,
  entityType,
  onChange,
  settings,
  columnsMetadata,
}: {
  data: DatasetData;
  entityType?: string;
  onChange: (settings: {
    left: string[];
    right: string[];
    entityIcon?: string;
  }) => void;
  settings?: ComputedVisualizationSettings;
  columnsMetadata: Lib.ColumnMetadata[];
}) => {
  const { cols } = data;

  // Use the same default inference as the list view
  const { titleColumn, subtitleColumn, rightColumns } = useListColumns(
    cols,
    settings?.["list.columns"],
  );

  // Selected values
  const [leftValues, setLeftValues] = useState(() => [
    ...(titleColumn ? [titleColumn.name] : []),
    ...(subtitleColumn ? [subtitleColumn.name] : []),
  ]);
  useEffect(() => {
    setLeftValues([
      ...(titleColumn ? [titleColumn.name] : []),
      ...(subtitleColumn ? [subtitleColumn.name] : []),
    ]);
  }, [titleColumn, subtitleColumn]);
  const [rightValues, setRightValues] = useState(
    () => rightColumns.map((col) => col?.name).filter(Boolean) as string[],
  );
  useEffect(() => {
    setRightValues(
      rightColumns.map((col) => col?.name).filter(Boolean) as string[],
    );
  }, [rightColumns]);

  // Selected icon state
  const [selectedEntityIcon, setSelectedEntityIcon] = useState<string>(
    () => settings?.["list.entity_icon"] || getEntityIcon(entityType),
  );

  // Active drag state for overlay
  const [activeId, setActiveId] = useState<string | null>(null);
  const [currentDroppable, setCurrentDroppable] = useState<string | null>(null);

  // All options from cols
  const allOptions = cols.map((col) => ({
    value: col.name,
    label: col.display_name,
  }));

  // Exclude options already used by any of the two selects, but keep the ones
  // selected in the respective select so tags render properly
  const used = new Set([...leftValues, ...rightValues]);
  const leftOptions = allOptions.filter(
    (opt) => !used.has(opt.value) || leftValues.includes(opt.value),
  );
  const rightOptions = allOptions.filter(
    (opt) => !used.has(opt.value) || rightValues.includes(opt.value),
  );

  const findColByName = (name?: string): DatasetColumn | undefined =>
    cols.find((c) => c.name === name);

  const selectedTitleColumn = findColByName(leftValues[0]);
  const selectedSubtitleColumn = findColByName(leftValues[1]) ?? null;
  const selectedRightColumns = rightValues
    .slice(0, 5)
    .map(findColByName)
    .filter(Boolean) as DatasetColumn[];

  const previewSample = useMemo(
    () => generatePreviewSample(data.rows, columnsMetadata),
    [data.rows, columnsMetadata],
  );

  const onConfigurationChange = ({
    left = leftValues,
    right = rightValues,
    entityIcon,
  }: {
    left: string[];
    right: string[];
    entityIcon?: string;
  }) => {
    setLeftValues(left);
    setRightValues(right);
    onChange({ left, right, entityIcon });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    const containerId = over?.data?.current?.containerId;
    if (!containerId) {
      return;
    }
    // Storing the id of container under dragged element
    // to hide it in original container when dragging between the two.
    setCurrentDroppable(containerId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    setCurrentDroppable(null);
    const { active, over } = event;

    if (!over) {
      return;
    }

    const activeId = String(active.id);
    const from = active.data?.current?.containerId as ContainerId | undefined;

    if (!from) {
      return;
    }

    // Determine target container - could be from over item's containerId or over.id itself
    let to: ContainerId | undefined;
    let overIndexInTo = -1;

    // Check if we're dropping on an item (has containerId)
    if (over.data?.current?.containerId) {
      to = over.data.current.containerId as ContainerId;
      const toList = to === "left" ? leftValues : rightValues;
      overIndexInTo = toList.indexOf(String(over.id));
    }
    // Check if we're dropping on a container itself (droppable area)
    else if (over.id === "left" || over.id === "right") {
      to = over.id as ContainerId;
      overIndexInTo = -1; // Append to end when dropping on container
    }

    if (!to) {
      return;
    }

    const fromList = from === "left" ? leftValues : rightValues;

    const fromIndex = fromList.indexOf(activeId);
    if (fromIndex === -1) {
      return;
    }

    // Same container: reorder
    if (from === to) {
      if (overIndexInTo === -1 || fromIndex === overIndexInTo) {
        return;
      }
      const next = arrayMove(fromList, fromIndex, overIndexInTo);
      if (from === "left") {
        onConfigurationChange({
          left: next,
          right: rightValues,
          entityIcon: selectedEntityIcon,
        });
      } else {
        onConfigurationChange({
          left: leftValues,
          right: next,
          entityIcon: selectedEntityIcon,
        });
      }
      return;
    }

    // Moving items between containers
    const maxForTo = to === "left" ? MAX_LEFT_COLUMNS : MAX_RIGHT_COLUMNS;
    const toCurrent = to === "left" ? leftValues : rightValues;
    if (toCurrent.length >= maxForTo) {
      return;
    }

    const nextFrom = fromList.slice() as string[];
    nextFrom.splice(fromIndex, 1);

    const nextTo = toCurrent.slice() as string[];
    const insertIndex = overIndexInTo === -1 ? nextTo.length : overIndexInTo;
    nextTo.splice(insertIndex, 0, activeId);

    if (to === "left") {
      onConfigurationChange({
        left: nextTo,
        right: nextFrom,
        entityIcon: selectedEntityIcon,
      });
    } else {
      onConfigurationChange({
        left: nextFrom,
        right: nextTo,
        entityIcon: selectedEntityIcon,
      });
    }
  };

  // Get the active item data for the overlay
  const activeItem = activeId
    ? {
        id: activeId,
        label:
          allOptions.find((opt) => opt.value === activeId)?.label ?? activeId,
      }
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <Stack
        h="100%"
        p="2rem"
        align="center"
        className={S.listViewContainer}
        style={{ "--grid-columns": Math.max(rightValues.length, 1) }}
      >
        <Stack justify="center" flex={1} maw="var(--max-width)" w="100%">
          <Text fw="bold">{t`Customize List columns`}</Text>
          <Box className={S.listViewConfigurationInputs}>
            {/* Icon selector */}
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <ActionIcon
                  data-testid="list-view-icon"
                  variant="subtle"
                  p={0}
                  w={32}
                  h={32}
                  style={{
                    border: "1px dashed var(--mb-color-border)",
                    marginTop: "0.25rem",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    backgroundColor: "var(--mb-color-background-light)",
                  }}
                >
                  <Icon
                    tooltip="Entity icon"
                    name={selectedEntityIcon as IconName}
                    size={16}
                    className={S.listEntityIcon}
                  />
                </ActionIcon>
              </Menu.Target>

              <Menu.Dropdown>
                {Object.entries(ENTITY_ICONS).map(([key, iconName]) => (
                  <Menu.Item
                    key={key}
                    leftSection={<Icon name={iconName} size={16} />}
                    onClick={() => {
                      setSelectedEntityIcon(iconName);
                      onConfigurationChange({
                        left: leftValues,
                        right: rightValues,
                        entityIcon: iconName,
                      });
                    }}
                  >
                    {formatEntityIconName(key)}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>

            {/* Title + Subtitle */}
            <ReorderableTagsInput
              size="xs"
              miw="10rem"
              maw="33%"
              data={leftOptions}
              value={leftValues}
              onChange={(value) =>
                onConfigurationChange({ left: value, right: rightValues })
              }
              maxValues={MAX_LEFT_COLUMNS}
              placeholder={leftValues.length > 0 ? "" : t`Title + Subtitle`}
              data-testid="list-view-left-columns"
              containerId="left"
              useExternalDnd={true}
              draggedItemId={activeId}
              currentDroppable={currentDroppable}
            />

            {/* Right columns */}
            <ReorderableTagsInput
              size="xs"
              data={rightOptions}
              value={rightValues}
              onChange={(value) =>
                onConfigurationChange({ left: leftValues, right: value })
              }
              maxValues={MAX_RIGHT_COLUMNS}
              placeholder={
                rightValues.length === MAX_RIGHT_COLUMNS ? "" : t`Right columns`
              }
              data-testid="list-view-right-columns"
              containerId="right"
              useExternalDnd={true}
              draggedItemId={activeId}
              currentDroppable={currentDroppable}
            />
          </Box>
        </Stack>
        <Divider w="100%" maw="var(--max-width)" />
        <Stack
          w="100%"
          maw="var(--max-width)"
          flex={1}
          justify="center"
          className={S.listContainer}
          data-testid="list-view-preview"
        >
          <Text fw="bold">{t`Preview`}</Text>
          <ListViewItem
            row={previewSample}
            cols={cols}
            settings={settings as ComputedVisualizationSettings}
            entityIcon={selectedEntityIcon}
            imageColumn={undefined}
            titleColumn={selectedTitleColumn}
            subtitleColumn={selectedSubtitleColumn}
            rightColumns={selectedRightColumns}
            onClick={() => {}}
            style={{ cursor: "default" }}
          />
        </Stack>
      </Stack>

      <DragOverlay modifiers={[snapCenterToCursor]}>
        {activeItem ? (
          <SortablePill id={activeItem.id} label={activeItem.label} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

function generatePreviewSample(rows: RowValues[], cols: Lib.ColumnMetadata[]) {
  const sample = rows[0] || Array(cols.length).fill(null);

  return sample.map((value, index) =>
    value == null ? getColumnExample(cols[index]) : value,
  );
}
