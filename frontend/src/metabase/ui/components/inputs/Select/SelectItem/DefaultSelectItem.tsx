import { Text } from "@mantine/core";
import { type Ref, forwardRef } from "react";

import { Icon, type IconName } from "metabase/ui";

import { SelectItem, type SelectItemProps } from "./SelectItem";

export interface DefaultSelectItemProps extends SelectItemProps {
  icon?: IconName;
  label?: string | JSX.Element;
  value: string;
}

export const DefaultSelectItem = forwardRef(function DefaultSelectItem(
  { icon, label, value, ...props }: DefaultSelectItemProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <SelectItem ref={ref} {...props}>
      {icon && <Icon name={icon} />}

      <Text c="inherit" lh="inherit">
        {label ?? value}
      </Text>
    </SelectItem>
  );
});
