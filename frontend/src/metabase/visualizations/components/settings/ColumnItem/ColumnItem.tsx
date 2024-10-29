import type { AccentColorOptions } from "metabase/lib/colors/types";
import type { IconProps } from "metabase/ui";
import { Icon } from "metabase/ui";

import {
  ColumnItemColorPicker,
  ColumnItemContainer,
  ColumnItemContent,
  ColumnItemDragHandle,
  ColumnItemIcon,
  ColumnItemRoot,
  ColumnItemSpan,
} from "./ColumnItem.styled";

interface ColumnItemProps {
  className?: string;
  title: string;
  color?: string;
  role?: string;
  draggable?: boolean;
  icon?: IconProps["name"];
  removeIcon?: IconProps["name"];
  onClick?: () => void;
  onAdd?: (target: HTMLElement) => void;
  onRemove?: (target: HTMLElement) => void;
  onEdit?: (target: HTMLElement) => void;
  onEnable?: (target: HTMLElement) => void;
  onColorChange?: (newColor: string) => void;
  accentColorOptions?: AccentColorOptions;
}

const BaseColumnItem = ({
  className,
  title,
  color,
  role,
  draggable = false,
  icon,
  removeIcon = "eye_outline",
  onClick,
  onAdd,
  onRemove,
  onEdit,
  onEnable,
  onColorChange,
  accentColorOptions,
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
            accentColorOptions={accentColorOptions}
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
              icon={removeIcon}
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
