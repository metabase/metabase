/* eslint-disable react/prop-types */

import type { CheckboxProps } from "@mantine/core";
import { Icon } from "metabase/core/components/Icon";

export const CheckboxIcon: CheckboxProps["icon"] = ({
  indeterminate,
  className,
}) => {
  const iconName = indeterminate ? "dash" : "check";

  return <Icon className={className} name={iconName} />;
};
