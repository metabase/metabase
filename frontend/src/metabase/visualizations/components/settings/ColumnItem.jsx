/* eslint-disable react/prop-types */
import React from "react";

import {
  ColumnItemIcon,
  ColumnItemSpan,
  ColumnItemContent,
  ColumnItemContainer,
  ColumnItemRoot,
  ColumnItemDragHandle,
  ColumnItemColorPicker,
} from "./ColumnItem.styled";

const ActionIcon = ({ icon, onClick }) => (
  <ColumnItemIcon
    name={icon}
    onClick={e => {
      e.stopPropagation();
      onClick(e.target);
    }}
  />
);

const ColumnItem = ({
  title,
  color,
  onAdd,
  onRemove,
  onClick,
  onEdit,
  onEnable,
  onColorChange,
  draggable,
  className = "",
  isHidden,
}) => {
  return (
    <ColumnItemRoot
      className={className}
      onClick={onClick}
      isDraggable={draggable}
      data-testid={`draggable-item-${title}`}
      isHidden={isHidden}
    >
      <ColumnItemContainer>
        {draggable && <ColumnItemDragHandle name="grabber2" size={12} />}
        {onColorChange && color && (
          <ColumnItemColorPicker
            value={color}
            onChange={onColorChange}
            pillSize="small"
          />
        )}
        <ColumnItemContent>
          <ColumnItemSpan>{title}</ColumnItemSpan>
          {onEdit && <ActionIcon icon="ellipsis" onClick={onEdit} />}
          {onAdd && <ActionIcon icon="add" onClick={onAdd} />}
          {onRemove && <ActionIcon icon="eye_outline" onClick={onRemove} />}
          {onEnable && <ActionIcon icon="eye_crossed_out" onClick={onEnable} />}
        </ColumnItemContent>
      </ColumnItemContainer>
    </ColumnItemRoot>
  );
};

export default Object.assign(ColumnItem, {
  Root: ColumnItemRoot,
  Container: ColumnItemContainer,
});
