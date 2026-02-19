import { Text } from "@mantine/core";
import { type ReactNode, type Ref, forwardRef } from "react";

import { Icon, type IconName } from "metabase/ui";

import { SelectItem, type SelectItemProps } from "./SelectItem";

export interface DefaultSelectItemProps extends SelectItemProps {
  icon?: IconName;
  label?: ReactNode;
  value: string;
}

export const DefaultSelectItem = forwardRef(function DefaultSelectItem(
  { icon, label, value, ...props }: DefaultSelectItemProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <SelectItem ref={ref} {...props}>
      {icon && <Icon name={icon} flex="0 0 1rem" />}

      <Text c="inherit" lh="inherit">
        {label ?? value}
      </Text>
    </SelectItem>
  );
});
