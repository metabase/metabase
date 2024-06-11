import { type BoxProps, Group, Text } from "@mantine/core";
import cx from "classnames";
import { forwardRef, type HTMLAttributes, type Ref } from "react";

import { Icon, type IconName } from "metabase/ui";

import S from "./SelectItem.module.css";

interface SelectItemProps extends HTMLAttributes<HTMLDivElement>, BoxProps {
  value: string;
  label?: string;
  icon?: IconName;
  selected?: boolean;
  disabled?: boolean;
}

export const SelectItem = forwardRef(function SelectItem(
  {
    className,
    value,
    label = value,
    icon,
    selected,
    disabled,
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
          [S.selected]: selected,
          [S.disabled]: disabled,
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
