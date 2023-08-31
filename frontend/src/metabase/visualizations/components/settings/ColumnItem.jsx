/* eslint-disable react/prop-types */
import {
  ColumnItemButton,
  ColumnItemIcon,
  ColumnItemSpan,
  ColumnItemContent,
  ColumnItemContainer,
  ColumnItemRoot,
  ColumnItemDragHandle,
  ColumnItemColorPicker,
} from "./ColumnItem.styled";

const ActionButton = ({ icon, onClick, ...props }) => (
  <ColumnItemButton
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
  icon,
  ...props
}) => {
  return (
    <ColumnItemRoot
      className={className}
      onClick={onClick}
      isDraggable={draggable}
      data-testid={draggable ? `draggable-item-${title}` : null}
      {...props}
      title={props.role ? title : null}
    >
      <ColumnItemContainer>
        {draggable && <ColumnItemDragHandle name="grabber" size={12} />}
        {onColorChange && color && (
          <ColumnItemColorPicker
            value={color}
            onChange={onColorChange}
            pillSize="small"
          />
        )}
        <ColumnItemContent>
          {icon && <ColumnItemIcon name={icon} />}
          <ColumnItemSpan>{title}</ColumnItemSpan>
          {onEdit && (
            <ActionButton
              icon="ellipsis"
              onClick={onEdit}
              data-testid={`${title}-settings-button`}
            />
          )}
          {onAdd && (
            <ActionButton
              icon="add"
              onClick={onAdd}
              data-testid={`${title}-add-button`}
            />
          )}
          {onRemove && (
            <ActionButton
              icon="eye_outline"
              onClick={onRemove}
              data-testid={`${title}-hide-button`}
            />
          )}
          {onEnable && (
            <ActionButton
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
  Content: ColumnItemContent,
  Button: ColumnItemButton,
  DragHandle: ColumnItemDragHandle,
});
