import cx from "classnames";

import CS from "metabase/css/core/index.css";
import type { AccentColorOptions } from "metabase/lib/colors/types";
import type { IconProps } from "metabase/ui";
import { Flex, Group, Icon, Text } from "metabase/ui";

import { ChartSettingActionIcon } from "../ChartSettingActionIcon";
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
}: ColumnItemProps) => {
  return (
    <Flex
      w="100%"
      bg="bg-white"
      c="text-medium"
      className={cx(
        ColumnItemS.ColumnItemRoot,
        {
          [ColumnItemS.Draggable]: draggable,
        },
        className,
      )}
      role={role}
      onClick={onClick}
      aria-label={role ? title : undefined}
      data-testid={draggable ? `draggable-item-${title}` : null}
      data-enabled={!!onRemove}
      px="sm"
      py="xs"
      my="sm"
    >
      <Group noWrap spacing="xs" p="xs">
        {draggable && (
          <Icon className={ColumnItemS.ColumnItemDragHandle} name="grabber" />
        )}
        {onColorChange && color && (
          <ChartSettingColorPicker
            value={color}
            onChange={onColorChange}
            pillSize="small"
            accentColorOptions={accentColorOptions}
          />
        )}
      </Group>
      <Group className={CS.flex1} px="xs">
        {icon && <Icon name={icon} />}
        <Text lh="normal" fw="bold">
          {title}
        </Text>
      </Group>
      <Group noWrap spacing="sm" p="xs">
        {onEdit && (
          <ChartSettingActionIcon
            icon="ellipsis"
            onClick={onEdit}
            data-testid={`${title}-settings-button`}
          />
        )}
        {onAdd && (
          <ChartSettingActionIcon
            icon="add"
            onClick={onAdd}
            data-testid={`${title}-add-button`}
          />
        )}
        {onRemove && (
          <ChartSettingActionIcon
            icon={removeIcon}
            onClick={onRemove}
            data-testid={`${title}-hide-button`}
          />
        )}
        {onEnable && (
          <ChartSettingActionIcon
            icon="eye_crossed_out"
            onClick={onEnable}
            data-testid={`${title}-show-button`}
          />
        )}
      </Group>
    </Flex>
  );
};
