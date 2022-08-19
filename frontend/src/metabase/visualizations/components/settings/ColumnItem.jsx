/* eslint-disable react/prop-types */
import React from "react";

import {
  ColumnItemIcon,
  ColumnItemSpan,
  ColumnItemContent,
  ColumnItemContainer,
  ColumnItemRoot,
  ColumnItemDragHandle,
} from "./ColumnItem.styled";

const ActionIcon = ({ icon, onClick }) => (
  <ColumnItemIcon
    name={icon}
    onClick={e => {
      e.stopPropagation();
      onClick();
    }}
  />
);

const ColumnItem = ({ title, onAdd, onRemove, onClick, onEdit, draggable }) => (
  <ColumnItemRoot draggable={draggable} onClick={onClick}>
    <ColumnItemContainer>
      {draggable && <ColumnItemDragHandle name="grabber2" />}
      <ColumnItemContent>
        <ColumnItemSpan>{title}</ColumnItemSpan>
        {onEdit && <ActionIcon icon="ellipsis" onClick={onEdit} />}
        {onAdd && <ActionIcon icon="add" onClick={onAdd} />}
        {onRemove && <ActionIcon icon="eye_filled" onClick={onRemove} />}
      </ColumnItemContent>
    </ColumnItemContainer>
  </ColumnItemRoot>
);

export default ColumnItem;
