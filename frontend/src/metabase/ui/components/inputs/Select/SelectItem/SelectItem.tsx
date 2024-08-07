import { type BoxProps, Group, type MantineSize, Text } from "@mantine/core";
import cx from "classnames";
import { forwardRef, type HTMLAttributes, type Ref } from "react";

import { Icon, type IconName } from "metabase/ui";

import S from "./SelectItem.module.css";
import { getItemFontSize, getItemLineHeight } from "./utils";

export interface SelectItemProps
  extends HTMLAttributes<HTMLDivElement>,
    BoxProps {
  value: string;
  label?: string;
  size?: MantineSize;
  icon?: IconName;
  selected?: boolean;
  disabled?: boolean;
}

export const SelectItem = forwardRef(function SelectItem(
  {
    className,
    value,
    label = value,
    size = "md",
    icon,
    selected,
    disabled,
    ...props
  }: SelectItemProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <Group
      ref={ref}
      className={cx(
        S.item,
        {
          [S.selected]: selected,
          [S.disabled]: disabled,
        },
        className,
      )}
      color="text-dark"
      fz={getItemFontSize(size)}
      lh={getItemLineHeight(size)}
      p="sm"
      spacing="sm"
      role="option"
      aria-selected={selected}
      {...props}
    >
      {icon && <Icon name={icon} />}
      <Text color="inherit" lh="inherit">
        {label}
      </Text>
    </Group>
  );
});
