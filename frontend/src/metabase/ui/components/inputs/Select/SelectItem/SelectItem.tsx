import { type BoxProps, Group, type MantineSize, Text } from "@mantine/core";
import cx from "classnames";
import { type HTMLAttributes, type Ref, forwardRef } from "react";

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
      fz={getItemFontSize(size)}
      lh={getItemLineHeight(size)}
      p="sm"
      gap="sm"
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
