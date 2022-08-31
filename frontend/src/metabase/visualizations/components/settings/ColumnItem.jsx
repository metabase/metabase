/* eslint-disable react/prop-types */
import React, { useRef } from "react";

import {
  ColumnItemIcon,
  ColumnItemSpan,
  ColumnItemContent,
  ColumnItemContainer,
  ColumnItemRoot,
  ColumnItemDragHandle,
} from "./ColumnItem.styled";

const ActionIcon = React.forwardRef(function ActionIcon(
  { icon, onClick },
  ref,
) {
  return (
    <ColumnItemIcon
      ref={ref}
      name={icon}
      onClick={e => {
        e.stopPropagation();
        onClick();
      }}
    />
  );
});

const ColumnItem = ({
  title,
  onAdd,
  onRemove,
  onClick,
  onEdit,
  onEnable,
  draggable,
}) => {
  const settingsRef = useRef(null);

  const handleOnEdit = () => {
    onEdit(settingsRef.current);
  };

  return (
    <ColumnItemRoot draggable={draggable} onClick={onClick}>
      <ColumnItemContainer>
        {draggable && <ColumnItemDragHandle name="grabber2" size={12} />}
        <ColumnItemContent>
          <ColumnItemSpan>{title}</ColumnItemSpan>
          {onEdit && (
            <ActionIcon
              icon="ellipsis"
              onClick={handleOnEdit}
              ref={settingsRef}
            />
          )}
          {onAdd && <ActionIcon icon="add" onClick={onAdd} />}
          {onRemove && <ActionIcon icon="eye_filled" onClick={onRemove} />}
          {onEnable && <ActionIcon icon="eye_crossed_out" onClick={onEnable} />}
        </ColumnItemContent>
      </ColumnItemContainer>
    </ColumnItemRoot>
  );
};

export default ColumnItem;
