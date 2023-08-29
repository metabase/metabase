import { forwardRef } from "react";
import { Group, Text } from "@mantine/core";
import type { ComponentPropsWithoutRef } from "react";
import { Icon } from "metabase/core/components/Icon";
import type { IconName } from "metabase/core/components/Icon";

interface SelectItemProps extends ComponentPropsWithoutRef<"div"> {
  label: string;
  icon?: IconName;
}

export const SelectItem = forwardRef<HTMLDivElement, SelectItemProps>(
  function SelectItem({ label, icon, ...others }: SelectItemProps, ref) {
    return (
      <Group ref={ref} spacing="0.75rem" {...others}>
        {icon && <Icon name={icon} />}
        <Text>{label}</Text>
      </Group>
    );
  },
);
