import cx from "classnames";

import CS from "metabase/css/core/index.css";
import type { AccentColorOptions } from "metabase/lib/colors/types";
import type { IconProps } from "metabase/ui";
import { ActionIcon, Group, Icon, Text } from "metabase/ui";

import { ChartSettingColorPicker } from "../ChartSettingColorPicker";

import ColumnItemS from "./ColumnItem.module.css";

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

export const ColumnItem = ({
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
}: ColumnItemProps) => (
  <Group
    className={cx(
      {
        [CS.cursorPointer]: !!onClick,
        [CS.cursorGrab]: draggable,
      },
      ColumnItemS.ColumnItemContainer,
      CS.rounded,
      CS.bordered,
    )}
    w="100%"
    spacing="sm"
    p="sm"
    my="sm"
  >
    <Group
      spacing="xs"
      className={className}
      role={role}
      onClick={onClick}
      aria-label={role ? title : undefined}
      data-testid={draggable ? `draggable-item-${title}` : null}
      data-enabled={!!onRemove}
    >
      {draggable && <Icon name="grabber" className={ColumnItemS.GrabHandle} />}
      {onColorChange && color && (
        <ChartSettingColorPicker
          value={color}
          onChange={onColorChange}
          pillSize="small"
          accentColorOptions={accentColorOptions}
        />
      )}
    </Group>

    <Group className={ColumnItemS.ColumnItemTitle} spacing="xs" c="text-medium">
      {icon && <Icon name={icon} />}
      <Text fw="bold" c="inherit">
        {title}
      </Text>
    </Group>

    <Group spacing="xs">
      {onEdit && (
        <ActionIcon
          c="text-medium"
          style={{ pointerEvents: "all" }}
          size="sm"
          radius="xl"
          onClick={e => {
            e.stopPropagation();
            onEdit(e.currentTarget);
          }}
          data-testid={`${title}-settings-button`}
        >
          <Icon name="ellipsis" />
        </ActionIcon>
      )}
      {onAdd && (
        <ActionIcon
          c="text-medium"
          style={{ pointerEvents: "all" }}
          size="sm"
          radius="xl"
          onClick={e => {
            e.stopPropagation();
            onAdd(e.currentTarget);
          }}
          data-testid={`${title}-add-button`}
        >
          <Icon name="add" />
        </ActionIcon>
      )}
      {onRemove && (
        <ActionIcon
          c="text-medium"
          style={{ pointerEvents: "all" }}
          size="sm"
          radius="xl"
          onClick={e => {
            e.stopPropagation();
            onRemove(e.currentTarget);
          }}
          data-testid={`${title}-hide-button`}
        >
          <Icon name={removeIcon} />
        </ActionIcon>
      )}
      {onEnable && (
        <ActionIcon
          c="text-medium"
          style={{ pointerEvents: "all" }}
          size="sm"
          radius="xl"
          onClick={e => {
            e.stopPropagation();
            onEnable(e.currentTarget);
          }}
          data-testid={`${title}-show-button`}
        >
          <Icon name="eye_crossed_out" />
        </ActionIcon>
      )}
    </Group>
  </Group>
);
