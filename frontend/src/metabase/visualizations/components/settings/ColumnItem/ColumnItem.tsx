import type { IconProps } from "metabase/ui";
import { Icon } from "metabase/ui";

import {
  ColumnItemIcon,
  ColumnItemSpan,
  ColumnItemContent,
  ColumnItemContainer,
  ColumnItemRoot,
  ColumnItemDragHandle,
  ColumnItemColorPicker,
} from "./ColumnItem.styled";

interface ColumnItemProps {
  className?: string;
  title: string;
  color?: string;
  role?: string;
  draggable?: boolean;
  icon?: IconProps["name"];
  onClick?: () => void;
  onAdd?: (target: HTMLElement) => void;
  onRemove?: (target: HTMLElement) => void;
  onEdit?: (target: HTMLElement) => void;
  onEnable?: (target: HTMLElement) => void;
  onColorChange?: (newColor: string) => void;
}

const BaseColumnItem = ({
  className,
  title,
  color,
  role,
  draggable = false,
  icon,
  onClick,
  onAdd,
  onRemove,
  onEdit,
  onEnable,
  onColorChange,
}: ColumnItemProps) => {
  return (
    <ColumnItemRoot
      className={className}
      role={role}
      isDraggable={draggable}
      onClick={onClick}
      aria-label={role ? title : undefined}
      data-testid={draggable ? `draggable-item-${title}` : null}
      data-enabled={!!onRemove}
    >
      <ColumnItemContainer>
        {draggable && <ColumnItemDragHandle name="grabber" />}
        {onColorChange && color && (
          <ColumnItemColorPicker
            value={color}
            onChange={onColorChange}
            pillSize="small"
          />
        )}
        <ColumnItemContent>
          <ColumnItemSpan>
            {icon && <Icon name={icon} />}
            {title}
          </ColumnItemSpan>
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

interface ActionIconProps {
  icon: string;
  onClick: (target: HTMLElement) => void;
  "data-testid"?: string;
}

const ActionIcon = ({
  icon,
  onClick,
  "data-testid": dataTestId,
}: ActionIconProps) => (
  <ColumnItemIcon
    icon={icon}
    onlyIcon
    iconSize={16}
    data-testid={dataTestId}
    onClick={e => {
      e.stopPropagation();
      onClick(e.currentTarget);
    }}
  />
);

export const ColumnItem = Object.assign(BaseColumnItem, {
  Root: ColumnItemRoot,
  Container: ColumnItemContainer,
  Icon: ColumnItemIcon,
  Handle: ColumnItemDragHandle,
});
