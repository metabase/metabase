import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { forwardRef, useImperativeHandle, useRef } from "react";

import { Icon } from "metabase/ui";

import styles from "./DragHandle.module.css";

interface DragHandleProps {
  dragHandleListeners: SyntheticListenerMap | undefined;
}

const DRAG_HANDLE_SIZE = 12;

export const DragHandle = forwardRef<HTMLElement, DragHandleProps>(
  function DragHandle({ dragHandleListeners }, ref) {
    const elementRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => elementRef.current!, []);

    return (
      <div
        data-testid="drag-handle"
        ref={elementRef}
        className={styles.dragHandle}
        {...dragHandleListeners}
      >
        <Icon name="grabber" size={DRAG_HANDLE_SIZE} />
      </div>
    );
  },
);
