import {
  Checkbox as MantineCheckbox,
  type CheckboxProps as MantineCheckboxProps,
} from "@mantine/core";
import { forwardRef } from "react";

import { CheckboxCard } from "./CheckboxCard";

export type CheckboxProps = Omit<
  MantineCheckboxProps,
  "labelPosition" | "size"
>;

const CheckboxRoot = forwardRef<HTMLInputElement, CheckboxProps>(
  function CheckboxRoot(props, ref) {
    return <MantineCheckbox {...props} ref={ref} />;
  },
);

export const Checkbox = Object.assign(CheckboxRoot, {
  Group: MantineCheckbox.Group,
  Indicator: MantineCheckbox.Indicator,
  Card: CheckboxCard,
});

export type { CheckboxGroupProps } from "@mantine/core";
export type { CheckboxCardProps } from "./CheckboxCard";
export { checkboxOverrides } from "./Checkbox.config";
