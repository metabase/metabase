import type { CheckboxProps } from "@mantine/core";
import { Icon } from "metabase/core/components/Icon";

export const CheckboxIcon = (props: Partial<CheckboxProps>) => {
  const iconName = props.indeterminate ? "dash" : "check";

  return <Icon className={props.className} name={iconName} />;
};
