import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { MutableRefObject } from "react";
import { forwardRef } from "react";

import { Icon } from "metabase/ui";

import styles from "./DragHandle.module.css";

interface DragHandleProps {
  dragHandleListeners: SyntheticListenerMap | undefined;
}

const DRAG_HANDLE_SIZE = 12;

export const DragHandle = forwardRef<HTMLElement, DragHandleProps>(
  function DragHandle({ dragHandleListeners }, ref) {
    return (
      <div
        data-testid="drag-handle"
        ref={ref as MutableRefObject<HTMLDivElement>}
        className={styles.dragHandle}
        {...dragHandleListeners}
      >
        <Icon name="grabber" size={DRAG_HANDLE_SIZE} />
      </div>
    );
  },
);
