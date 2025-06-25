import type { UniqueIdentifier } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import cx from "classnames";
import type { CSSProperties, ElementType, ReactNode } from "react";

import S from "./Sortable.module.css";

export interface SortableProps {
  id: UniqueIdentifier;
  as?: ElementType;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
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
  className,
  style,
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

  return (
    <Component
      className={cx(className, { [S.dragging]: isDragging })}
      style={{
        ...style,
        ...(isDragging ? draggingStyle : {}),
        transform: CSS.Translate.toString(transform),
        transition: transition,
      }}
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
