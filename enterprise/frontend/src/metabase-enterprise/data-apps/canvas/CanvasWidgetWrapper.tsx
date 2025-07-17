import type { UniqueIdentifier } from "@dnd-kit/core";
import classNames from "classnames";
import { type HTMLAttributes, forwardRef } from "react";

import { Icon } from "metabase/ui";
import type { DataAppWidget } from "metabase-enterprise/data-apps/types";

import styles from "./DndCanvas.module.css";

export enum Position {
  Before = -1,
  After = 1,
}

export interface CanvasWidgetWrapperProps
  extends Omit<HTMLAttributes<HTMLButtonElement>, "id"> {
  active?: boolean;
  clone?: boolean;
  insertPosition?: Position;

  component: DataAppWidget;
  onComponentRender: (component: DataAppWidget) => React.ReactNode;

  index?: number;
  onRemove?(): void;
}

export const CanvasWidgetWrapper = forwardRef<
  HTMLLIElement,
  CanvasWidgetWrapperProps
>(function Page(
  {
    component,
    onComponentRender,
    index,
    active,
    clone,
    insertPosition,
    onRemove,
    style,
    ...props
  },
  ref,
) {
  return (
    <li
      className={classNames(
        styles.Wrapper,
        active && styles.active,
        clone && styles.clone,
        insertPosition === Position.Before && styles.insertBefore,
        insertPosition === Position.After && styles.insertAfter,
      )}
      style={style}
      ref={ref}
    >
      <button
        className={styles.Page}
        data-id={component?.id?.toString()}
        {...props}
      >
        {onComponentRender(component)}
      </button>

      {!active && onRemove ? (
        <button className={styles.Remove} onClick={onRemove}>
          <Icon name="close" />
        </button>
      ) : null}
      {index != null ? (
        <span className={styles.PageNumber}>{index}</span>
      ) : null}
    </li>
  );
});
