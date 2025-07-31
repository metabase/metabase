import type { DraggableSyntheticListeners } from "@dnd-kit/core";
import type { Transform } from "@dnd-kit/utilities";
import classNames from "classnames";
import type React from "react";
import { forwardRef, memo, useEffect } from "react";

import type {
  DatasetColumn,
  FieldId,
  ObjectViewSectionSettings,
} from "metabase-types/api";

import { ColumnListItem } from "./ColumnListItem";
import styles from "./Item.module.css";

export interface Props {
  dragOverlay?: boolean;
  color?: string;
  disabled?: boolean;
  dragging?: boolean;
  handle?: boolean;
  handleProps?: any;
  height?: number;
  index?: number;
  fadeIn?: boolean;
  transform?: Transform | null;
  listeners?: DraggableSyntheticListeners;
  sorting?: boolean;
  style?: React.CSSProperties;
  transition?: string | null;
  wrapperStyle?: React.CSSProperties;
  value: React.ReactNode;
  onRemove?(): void;
  renderItem?(args: {
    dragOverlay: boolean;
    dragging: boolean;
    sorting: boolean;
    index: number | undefined;
    fadeIn: boolean;
    listeners: DraggableSyntheticListeners;
    ref: React.Ref<HTMLElement>;
    style: React.CSSProperties | undefined;
    transform: Props["transform"];
    transition: Props["transition"];
    value: Props["value"];
  }): React.ReactElement;

  //
  column: DatasetColumn;
  fieldSettings: {
    field_id: FieldId;
    style: "normal" | "bold" | "dim" | "title";
  };
  section: ObjectViewSectionSettings;
  onUpdateSection: (section: Partial<ObjectViewSectionSettings>) => void;
  // onRemoveSection?: () => void;
}

// eslint-disable-next-line react/display-name
const ItemBase = forwardRef<HTMLLIElement, Props>(
  (
    {
      color,
      dragOverlay,
      dragging,
      disabled,
      fadeIn,
      handle,
      handleProps,
      height,
      index,
      listeners,
      onRemove,
      renderItem,
      sorting,
      style,
      transition,
      transform,
      value,
      wrapperStyle,
      //
      column,
      fieldSettings,
      section,
      onUpdateSection,
      ...props
    },
    ref,
  ) => {
    useEffect(() => {
      if (!dragOverlay) {
        return;
      }

      document.body.style.cursor = "grabbing";

      return () => {
        document.body.style.cursor = "";
      };
    }, [dragOverlay]);

    const handleUpdateField = (
      fieldId: number,
      { style }: { style: "normal" | "bold" | "dim" | "title" },
    ) => {
      onUpdateSection({
        fields: section.fields.map((f) => {
          if (f.field_id === fieldId) {
            return { ...f, style };
          }
          return f;
        }),
      });
    };

    const handleHideField = (fieldId: number) => {
      onUpdateSection({
        fields: section.fields.filter((f) => f.field_id !== fieldId),
      });
    };

    return renderItem ? (
      renderItem({
        dragOverlay: Boolean(dragOverlay),
        dragging: Boolean(dragging),
        sorting: Boolean(sorting),
        index,
        fadeIn: Boolean(fadeIn),
        listeners,
        ref,
        style,
        transform,
        transition,
        value,
      })
    ) : (
      <li
        className={classNames(
          styles.Wrapper,
          fadeIn && styles.fadeIn,
          sorting && styles.sorting,
          dragOverlay && styles.dragOverlay,
        )}
        style={
          {
            ...wrapperStyle,
            transition: [transition, wrapperStyle?.transition]
              .filter(Boolean)
              .join(", "),
            "--translate-x": transform
              ? `${Math.round(transform.x)}px`
              : undefined,
            "--translate-y": transform
              ? `${Math.round(transform.y)}px`
              : undefined,
            "--scale-x": transform?.scaleX ? `${transform.scaleX}` : undefined,
            "--scale-y": transform?.scaleY ? `${transform.scaleY}` : undefined,
            "--index": index,
            "--color": color,
          } as React.CSSProperties
        }
        ref={ref}
      >
        <div
          className={classNames(
            styles.Item,
            dragging && styles.dragging,
            handle && styles.withHandle,
            dragOverlay && styles.dragOverlay,
            disabled && styles.disabled,
            color && styles.color,
          )}
          style={style}
          data-cypress="draggable-item"
          {...(!handle ? listeners : undefined)}
          {...props}
          tabIndex={!handle ? 0 : undefined}
        >
          <ColumnListItem
            key={fieldSettings.field_id}
            column={column}
            style={fieldSettings.style}
            onChangeFieldSettings={(update) =>
              handleUpdateField(fieldSettings.field_id, update)
            }
            onHideField={() => handleHideField(fieldSettings.field_id)}
          />
        </div>
      </li>
    );
  },
);

export const Item = memo(ItemBase);
