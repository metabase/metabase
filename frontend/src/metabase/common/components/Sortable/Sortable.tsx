import type { UniqueIdentifier } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import cx from "classnames";
import {
  type CSSProperties,
  type ElementType,
  type MutableRefObject,
  type ReactNode,
  useEffect,
  useRef,
} from "react";

import S from "./Sortable.module.css";

export interface SortableProps {
  id: UniqueIdentifier;
  as?: ElementType;
  children:
    | ReactNode
    | ((data: {
        dragHandleRef: MutableRefObject<HTMLElement | null>;
        dragHandleListeners: SyntheticListenerMap | undefined;
      }) => ReactNode);
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
  role,
}: SortableProps) {
  const dragHandleRef = useRef(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    setActivatorNodeRef,
  } = useSortable({
    id,
    disabled,
    animateLayoutChanges: () => false,
  });

  useEffect(() => {
    if (dragHandleRef?.current) {
      setActivatorNodeRef(dragHandleRef.current);
    }
  }, [dragHandleRef, setActivatorNodeRef]);

  const childrenAsFunction = typeof children === "function";

  // Without a keyboard sensor, these would make the wrapper a tab stop that does nothing
  const dragAttributes = listeners?.onKeyDown ? attributes : undefined;

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
      {...dragAttributes}
      {...(!childrenAsFunction && listeners)}
      role={role ?? dragAttributes?.role}
    >
      {childrenAsFunction
        ? children({ dragHandleRef, dragHandleListeners: listeners })
        : children}
    </Component>
  );
}
