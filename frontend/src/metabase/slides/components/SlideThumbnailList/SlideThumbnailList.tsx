import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { t } from "ttag";

import { ActionIcon, Button, Icon, Menu } from "metabase/ui";

import type { Slide } from "../../types";
import { SlideThumbnail } from "../SlideThumbnail/SlideThumbnail";

import S from "./SlideThumbnailList.module.css";

interface SortableThumbnailProps {
  slide: Slide;
  index: number;
  active: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

const SortableThumbnail = ({
  slide,
  index,
  active,
  canDelete,
  onSelect,
  onDelete,
}: SortableThumbnailProps) => {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } =
    useSortable({ id: slide.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={S.item}
      {...attributes}
      {...listeners}
    >
      <SlideThumbnail
        slide={slide}
        index={index}
        active={active}
        onClick={onSelect}
        menu={
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                size="sm"
                aria-label={t`Slide options`}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Icon name="ellipsis" size={14} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                color="danger"
                disabled={!canDelete}
                leftSection={<Icon name="trash" size={14} />}
                onClick={onDelete}
              >
                {t`Delete slide`}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        }
      />
    </li>
  );
};

interface SlideThumbnailListProps {
  slides: Slide[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onReorder: (from: number, to: number) => void;
}

export const SlideThumbnailList = ({
  slides,
  activeIndex,
  onSelect,
  onAdd,
  onDelete,
  onReorder,
}: SlideThumbnailListProps) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) {
      return;
    }
    const from = slides.findIndex((s) => s.id === e.active.id);
    const to = slides.findIndex((s) => s.id === e.over!.id);
    if (from === -1 || to === -1) {
      return;
    }
    onReorder(from, to);
  };

  return (
    <ul className={S.list}>
      <DndContext
        sensors={sensors}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={slides.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {slides.map((slide, i) => (
            <SortableThumbnail
              key={slide.id}
              slide={slide}
              index={i}
              active={i === activeIndex}
              canDelete={slides.length > 1}
              onSelect={() => onSelect(i)}
              onDelete={() => onDelete(i)}
            />
          ))}
        </SortableContext>
      </DndContext>
      <Button
        className={S.addButton}
        variant="light"
        leftSection={<Icon name="add" />}
        onClick={onAdd}
        fullWidth
      >
        {t`Add slide`}
      </Button>
    </ul>
  );
};
