import { type BoxProps, Group, type MantineSize, Text } from "@mantine/core";
import cx from "classnames";
import { forwardRef, type HTMLAttributes, type Ref } from "react";

import { Icon, type IconName } from "metabase/ui";

import S from "./CustomSelectItem.module.css";
import { getItemFontSize, getItemLineHeight } from "./utils";

interface CustomSelectItemProps
  extends HTMLAttributes<HTMLDivElement>,
    BoxProps {
  value: string;
  label?: string;
  size?: MantineSize;
  icon?: IconName;
  selected?: boolean;
  disabled?: boolean;
}

export const CustomSelectItem = forwardRef(function CustomSelectItem(
  {
    className,
    value,
    label = value,
    size = "md",
    icon,
    selected,
    disabled,
    ...props
  }: CustomSelectItemProps,
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
      {...props}
    >
      {icon && <Icon name={icon} />}
      <Text color="inherit" lh="inherit">
        {label}
      </Text>
    </Group>
  );
});
