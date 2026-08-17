import { Checkbox as MantineCheckbox } from "@mantine/core";

import { CheckboxCard } from "./CheckboxCard";

export const Checkbox = Object.assign(MantineCheckbox, { Card: CheckboxCard });
export type { CheckboxProps, CheckboxGroupProps } from "@mantine/core";
export type { CheckboxCardProps } from "./CheckboxCard";
export { checkboxOverrides } from "./Checkbox.config";
