import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useEffect, useState } from "react";
import { t } from "ttag";

import { ReorderableTagsInput } from "metabase/common/components/ReorderableTagsInput/ReorderableTagsInput";
import { Box, Divider, Icon, Stack, Text } from "metabase/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { DatasetColumn, DatasetData } from "metabase-types/api";

import { getEntityIcon, useListColumns } from "./ListView";
import S from "./ListView.module.css";
import { ListViewItem } from "./ListViewItem";

export const ListViewConfiguration = ({
  data,
  entityType,
  onChange,
  settings,
}: {
  data: DatasetData;
  entityType?: string;
  onChange: (settings: { left: string[]; right: string[] }) => void;
  settings?: ComputedVisualizationSettings;
}) => {
  const { cols } = data;

  // Use the same default inference as the list view
  const { titleColumn, subtitleColumn, rightColumns } = useListColumns(
    cols,
    settings?.viewSettings?.listSettings,
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
    .map((n) => findColByName(n))
    .filter(Boolean) as DatasetColumn[];

  const firstRow = data.rows?.[0];
  const entityIcon = getEntityIcon(entityType);
  const emptySettings = {} as ComputedVisualizationSettings;

  const onConfigurationChange = ({
    left = leftValues,
    right = rightValues,
  }: {
    left: string[];
    right: string[];
  }) => {
    setLeftValues(left);
    setRightValues(right);
    onChange({ left, right });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) {
      return;
    }

    const activeId = String(active.id);
    const from = active.data?.current?.containerId as
      | "left"
      | "right"
      | undefined;

    if (!from) {
      return;
    }

    // Determine target container - could be from over item's containerId or over.id itself
    let to: "left" | "right" | undefined;
    let overIndexInTo = -1;

    // Check if we're dropping on an item (has containerId)
    if (over.data?.current?.containerId) {
      to = over.data.current.containerId as "left" | "right";
      const toList = to === "left" ? leftValues : rightValues;
      overIndexInTo = toList.indexOf(String(over.id));
    }
    // Check if we're dropping on a container itself (droppable area)
    else if (over.id === "left" || over.id === "right") {
      to = over.id as "left" | "right";
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
        onConfigurationChange({ left: next, right: rightValues });
      } else {
        onConfigurationChange({ left: leftValues, right: next });
      }
      return;
    }

    // Different containers: move
    // Enforce max sizes: left max 2, right max 5
    const maxForTo = to === "left" ? 2 : 5;
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
      });
    } else {
      onConfigurationChange({
        left: nextFrom,
        right: nextTo,
      });
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
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
            {/* Icon placeholder */}
            <Box
              w={32}
              h={32}
              style={{
                border: "1px dashed var(--mb-color-border)",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                backgroundColor: "var(--mb-color-background-light)",
              }}
            >
              <Icon
                tooltip="Not implemented yet, but we can add icon selection here"
                name={getEntityIcon(entityType)}
                size={16}
                c="text-light"
              />
            </Box>

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
              maxValues={2}
              placeholder={leftValues.length > 0 ? "" : "Title + Subtitle"}
              data-testid="list-view-left-columns"
              containerId="left"
              useExternalDnd={true}
            />

            {/* Right columns */}
            <ReorderableTagsInput
              size="xs"
              data={rightOptions}
              value={rightValues}
              onChange={(value) =>
                onConfigurationChange({ left: leftValues, right: value })
              }
              maxValues={5}
              placeholder={rightValues.length === 5 ? "" : "Right columns"}
              data-testid="list-view-right-columns"
              containerId="right"
              useExternalDnd={true}
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
        >
          <Text fw="bold">{t`Preview`}</Text>
          {firstRow ? (
            <ListViewItem
              row={firstRow}
              cols={cols}
              settings={emptySettings}
              entityIcon={entityIcon}
              imageColumn={undefined}
              titleColumn={selectedTitleColumn}
              subtitleColumn={selectedSubtitleColumn}
              rightColumns={selectedRightColumns}
              onClick={() => {}}
              style={{ cursor: "default" }}
            />
          ) : (
            <Text c="text-medium">{t`No data to preview`}</Text>
          )}
        </Stack>
      </Stack>
    </DndContext>
  );
};
