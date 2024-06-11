import { type BoxProps, Group, Text } from "@mantine/core";
import cx from "classnames";
import type { Ref, HTMLAttributes } from "react";
import { forwardRef } from "react";

import type { IconName } from "metabase/ui";
import { Icon } from "metabase/ui";

import S from "./SelectItem.module.css";

interface SelectItemProps extends HTMLAttributes<HTMLDivElement>, BoxProps {
  value: string;
  label?: string;
  icon?: IconName;
  isSelected?: boolean;
  isDisabled?: boolean;
}

export const SelectItem = forwardRef(function SelectItem(
  {
    className,
    value,
    label = value,
    icon,
    isSelected,
    isDisabled,
    ...others
  }: SelectItemProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <Group
      ref={ref}
      className={cx(
        S.item,
        {
          [S.selected]: isSelected,
          [S.disabled]: isDisabled,
        },
        className,
      )}
      color="text-dark"
      fz="md"
      lh="1.5rem"
      p="sm"
      spacing="sm"
      {...others}
    >
      {icon && <Icon name={icon} />}
      <Text color="inherit" lh="inherit">
        {label}
      </Text>
    </Group>
  );
});
