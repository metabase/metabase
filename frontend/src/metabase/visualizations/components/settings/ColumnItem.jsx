/* eslint-disable react/prop-types */
import {
  ColumnItemIcon,
  ColumnItemSpan,
  ColumnItemContent,
  ColumnItemContainer,
  ColumnItemRoot,
  ColumnItemDragHandle,
  ColumnItemColorPicker,
} from "./ColumnItem.styled";

const ActionIcon = ({ icon, onClick, ...props }) => (
  <ColumnItemIcon
    data-testid={props["data-testid"]}
    onlyIcon
    icon={icon}
    iconSize={16}
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
}) => {
  return (
    <ColumnItemRoot
      className={className}
      onClick={onClick}
      isDraggable={draggable}
      data-testid={`draggable-item-${title}`}
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
          {onEdit && (
            <ActionIcon
              icon="ellipsis"
              onClick={onEdit}
              data-testid={`${title}-settings-button`}
            />
          )}
          {onAdd && (
            <ActionIcon
              icon="add"
              onClick={onAdd}
              data-testid={`${title}-add-button`}
            />
          )}
          {onRemove && (
            <ActionIcon
              icon="eye_outline"
              onClick={onRemove}
              data-testid={`${title}-hide-button`}
            />
          )}
          {onEnable && (
            <ActionIcon
              icon="eye_crossed_out"
              onClick={onEnable}
              data-testid={`${title}-show-button`}
            />
          )}
        </ColumnItemContent>
      </ColumnItemContainer>
    </ColumnItemRoot>
  );
};

export default Object.assign(ColumnItem, {
  Root: ColumnItemRoot,
  Container: ColumnItemContainer,
});
