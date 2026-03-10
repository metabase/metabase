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
import { type ComponentProps, useMemo, useState } from "react";

import { Box, Divider, Stack, Text } from "metabase/ui";

import {
  type Option,
  ReorderableTagsInput,
  SortablePill,
} from "./ReorderableTagsInput";

const makeOptions = (): Option[] => [
  { value: "title", label: "Title" },
  { value: "subtitle", label: "Subtitle" },
  { value: "status", label: "Status" },
  { value: "owner", label: "Owner" },
  { value: "created_at", label: "Created at" },
  { value: "updated_at", label: "Updated at" },
  { value: "count", label: "Count" },
  { value: "country", label: "Country" },
  { value: "city", label: "City" },
  { value: "zip", label: "Zip code" },
];

const args = {
  data: makeOptions(),
  size: "xs" as const,
  placeholder: "Select values",
  maxValues: 5,
};

const argTypes = {
  data: {
    control: { type: "json" },
  },
  size: {
    options: ["xs", "md"],
    control: { type: "inline-radio" },
  },
  placeholder: {
    control: { type: "text" },
  },
  maxValues: {
    control: { type: "number" },
  },
};

export default {
  title: "Components/Inputs/ReorderableTagsInput",
  component: ReorderableTagsInput,
  args,
  argTypes,
};

export const Default = {
  render: function Render(
    storyArgs: ComponentProps<typeof ReorderableTagsInput>,
  ) {
    const [value, setValue] = useState<string[]>(
      [storyArgs.data[0]?.value, storyArgs.data[1]?.value].filter(Boolean),
    );

    return (
      <ReorderableTagsInput {...storyArgs} value={value} onChange={setValue} />
    );
  },
};

export const DragBetweenTwoInputs = {
  name: "Drag between two inputs",
  render: function Render() {
    const allOptions = useMemo(() => makeOptions(), []);

    // Two controlled lists
    const [leftValues, setLeftValues] = useState<string[]>([
      allOptions[0].value,
      allOptions[1].value,
    ]);
    const [rightValues, setRightValues] = useState<string[]>([
      allOptions[2].value,
      allOptions[3].value,
      allOptions[4].value,
    ]);

    // Filter options to exclude values already used in the other input
    const used = new Set([...leftValues, ...rightValues]);
    const leftOptions = allOptions.filter(
      (opt) => !used.has(opt.value) || leftValues.includes(opt.value),
    );
    const rightOptions = allOptions.filter(
      (opt) => !used.has(opt.value) || rightValues.includes(opt.value),
    );

    // DnD state and handlers
    const [activeId, setActiveId] = useState<string | null>(null);
    const [currentDroppable, setCurrentDroppable] = useState<string | null>(
      null,
    );

    const sensors = useSensors(
      useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    );

    const handleDragStart = (event: DragStartEvent) => {
      setActiveId(event.active.id as string);
    };

    const handleDragOver = (event: DragOverEvent) => {
      const { over } = event;
      const containerId = over?.data?.current?.containerId as
        | "left"
        | "right"
        | undefined;
      if (!containerId) {
        return;
      }
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
      const from = active.data?.current?.containerId as
        | "left"
        | "right"
        | undefined;
      if (!from) {
        return;
      }

      let to: "left" | "right" | undefined;
      let overIndexInTo = -1;

      if (over.data?.current?.containerId) {
        to = over.data.current.containerId as "left" | "right";
        const toList = to === "left" ? leftValues : rightValues;
        overIndexInTo = toList.indexOf(String(over.id));
      } else if (over.id === "left" || over.id === "right") {
        to = over.id as "left" | "right";
        overIndexInTo = -1;
      }

      if (!to) {
        return;
      }

      const fromList = from === "left" ? leftValues : rightValues;
      const fromIndex = fromList.indexOf(activeId);
      if (fromIndex === -1) {
        return;
      }

      if (from === to) {
        if (overIndexInTo === -1 || fromIndex === overIndexInTo) {
          return;
        }
        const next = arrayMove(fromList, fromIndex, overIndexInTo);
        if (from === "left") {
          setLeftValues(next);
        } else {
          setRightValues(next);
        }
        return;
      }

      const nextFrom = fromList.slice();
      nextFrom.splice(fromIndex, 1);

      const toCurrent = to === "left" ? leftValues : rightValues;
      const nextTo = toCurrent.slice();
      const insertIndex = overIndexInTo === -1 ? nextTo.length : overIndexInTo;
      nextTo.splice(insertIndex, 0, activeId);

      if (to === "left") {
        setLeftValues(nextTo);
        setRightValues(nextFrom);
      } else {
        setLeftValues(nextFrom);
        setRightValues(nextTo);
      }
    };

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
        <Stack gap="md" align="stretch">
          <Text fw="bold">Drag between two inputs</Text>
          <Box style={{ display: "flex", gap: "0.5rem" }}>
            <ReorderableTagsInput
              size="xs"
              miw="10rem"
              maw="33%"
              data={leftOptions}
              value={leftValues}
              onChange={setLeftValues}
              maxValues={2}
              placeholder={
                leftValues.length > 0 ? "" : "Left (Title + Subtitle)"
              }
              containerId="left"
              useExternalDnd={true}
              draggedItemId={activeId}
              currentDroppable={currentDroppable}
              data-testid="reorderable-left"
            />

            <ReorderableTagsInput
              size="xs"
              data={rightOptions}
              value={rightValues}
              onChange={setRightValues}
              maxValues={5}
              placeholder={
                rightValues.length === 5 ? "" : "Right (Up to 5 columns)"
              }
              containerId="right"
              useExternalDnd={true}
              draggedItemId={activeId}
              currentDroppable={currentDroppable}
              data-testid="reorderable-right"
            />
          </Box>
          <Divider />
          <Text size="sm" c="text-secondary">
            Tip: start dragging a tag to reorder within an input or move it
            between inputs.
          </Text>
        </Stack>

        {/* Drag overlay for smoother dragging visuals */}
        <DragOverlay modifiers={[snapCenterToCursor]}>
          {activeItem ? (
            <SortablePill id={activeItem.id} label={activeItem.label} />
          ) : null}
        </DragOverlay>
      </DndContext>
    );
  },
};
