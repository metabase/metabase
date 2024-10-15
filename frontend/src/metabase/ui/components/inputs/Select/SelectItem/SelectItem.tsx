import { type BoxProps, Group, type MantineSize, Text } from "@mantine/core";
import cx from "classnames";
import { type HTMLAttributes, type Ref, forwardRef } from "react";

import { Icon, type IconName } from "metabase/ui";

import S from "./SelectItem.module.css";
import { getItemFontSize, getItemLineHeight } from "./utils";

export interface SelectItemProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "style">,
    BoxProps {
  value: string;
  label?: string;
  size?: MantineSize;
  icon?: IconName;
  selected?: boolean;
  disabled?: boolean;
}

// FIXME:Is this needed anymore?
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
      className={cx(S.item, className)}
      fz={getItemFontSize(size)}
      lh={getItemLineHeight(size)}
      p="sm"
      gap="sm"
      flex={1}
      role="option"
      aria-selected={selected}
      {...props}
    >
      {icon && <Icon name={icon} />}
      <Text c="inherit" lh="inherit">
        {label}
      </Text>
    </Group>
  );
});
