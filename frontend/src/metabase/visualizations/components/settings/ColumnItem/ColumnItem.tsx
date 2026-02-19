import cx from "classnames";

import CS from "metabase/css/core/index.css";
import type { AccentColorOptions } from "metabase/lib/colors/types";
import {
  Flex,
  type FlexProps,
  Group,
  Icon,
  type IconProps,
  Text,
} from "metabase/ui";

import { ChartSettingActionIcon } from "../ChartSettingActionIcon";
import { ChartSettingColorPicker } from "../ChartSettingColorPicker";

import ColumnItemS from "./ColumnItem.module.css";

export interface ColumnItemProps {
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
  onDragStart?: FlexProps["onDragStart"];
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
  onDragStart,
}: ColumnItemProps) => (
  <Flex
    w="100%"
    bg="background-primary"
    c="text-secondary"
    className={cx(
      CS.overflowHidden,
      CS.bordered,
      CS.rounded,
      ColumnItemS.ColumnItemRoot,
      {
        [cx(ColumnItemS.Draggable, CS.cursorGrab)]: draggable,
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
    draggable={draggable}
    onDragStart={onDragStart}
  >
    <Group wrap="nowrap" gap="xs" p="xs">
      {draggable && (
        <Icon
          className={cx(CS.flexNoShrink, ColumnItemS.ColumnItemDragHandle)}
          name="grabber"
          data-testid="drag-handle"
        />
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
    <Group className={CS.flex1} px="xs" wrap="nowrap">
      {icon && <Icon name={icon} className={CS.flexNoShrink} />}
      <Text lh="normal" fw="bold" className={CS.textWrap}>
        {title}
      </Text>
    </Group>
    <Group wrap="nowrap" gap="sm" p="xs">
      {onEdit && (
        <ChartSettingActionIcon
          icon="ellipsis"
          onClick={(e) => onEdit(e.currentTarget)}
          data-testid={`${title}-settings-button`}
        />
      )}
      {onAdd && (
        <ChartSettingActionIcon
          icon="add"
          onClick={(e) => onAdd(e.currentTarget)}
          data-testid={`${title}-add-button`}
        />
      )}
      {onRemove && (
        <ChartSettingActionIcon
          icon={removeIcon}
          onClick={(e) => onRemove(e.currentTarget)}
          data-testid={`${title}-hide-button`}
        />
      )}
      {onEnable && (
        <ChartSettingActionIcon
          icon="eye_crossed_out"
          onClick={(e) => onEnable(e.currentTarget)}
          data-testid={`${title}-show-button`}
        />
      )}
    </Group>
  </Flex>
);
