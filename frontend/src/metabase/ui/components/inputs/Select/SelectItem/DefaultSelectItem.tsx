import { Text } from "@mantine/core";
import { type ReactNode, type Ref, forwardRef } from "react";

import { Icon } from "metabase/ui";
import type { IconName } from "metabase-types/api/icon";

import { type IconComponent, StaticIcon } from "../../../icons/Icon/StaticIcon";

import { SelectItem, type SelectItemProps } from "./SelectItem";

export interface DefaultSelectItemProps extends SelectItemProps {
  icon?: IconName | IconComponent;
  label?: ReactNode;
  value: string;
}

export const DefaultSelectItem = forwardRef(function DefaultSelectItem(
  { icon, label, value, ...props }: DefaultSelectItemProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <SelectItem ref={ref} {...props}>
      {typeof icon === "string" ? (
        <Icon name={icon} flex="0 0 1rem" />
      ) : (
        icon && <StaticIcon component={icon} flex="0 0 1rem" aria-hidden />
      )}

      <Text c="inherit" lh="inherit">
        {label ?? value}
      </Text>
    </SelectItem>
  );
});
