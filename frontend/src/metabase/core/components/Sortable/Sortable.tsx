import type { UniqueIdentifier } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, ElementType, ReactNode } from "react";

import S from "./Sortable.module.css";

export interface SortableProps {
  id: UniqueIdentifier;
  as?: ElementType;
  children: ReactNode;
  disabled?: boolean;
  draggingStyle?: CSSProperties;
  role?: string;
}

/**
 * Wrapper to use with dnd-kit's Sortable preset
 * https://docs.dndkit.com/presets/sortable
 */
export function Sortable({
  id,
  as: Component = "div",
  children,
  disabled = false,
  draggingStyle,
  role = "button",
}: SortableProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled,
    animateLayoutChanges: () => false,
  });

  const style = {
    ...(isDragging ? draggingStyle : {}),
    transform: CSS.Translate.toString(transform),
    transition: transition,
  };

  return (
    <Component
      className={isDragging ? S.dragging : undefined}
      style={style}
      data-is-dragging={isDragging}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role={role}
    >
      {children}
    </Component>
  );
}
