import type {
  ComboboxItem,
  ComboboxItemGroup,
  SelectProps as MantineSelectProps,
} from "@mantine/core";
import { Select as MantineSelect } from "@mantine/core";
export * from "./SelectItem";

import type { IconName } from "../../icons";

export type SelectOption<Value = string | null> = ComboboxItem & {
  value: Value;
  icon?: IconName;
} & Record<string, any>;

type SelectData<Value extends string | null> =
  | SelectOption<Value>[]
  | ComboboxItemGroup<SelectOption<Value>>[]
  | Value[];

/**
 * Mantine v7 loosened up the value types for Select, removing the generics, which sucks
 * This re-introduces the value generics to keep the type safety
 */
export interface SelectProps<Value extends string | null = string | null>
  extends Omit<MantineSelectProps, "data" | "onChange" | "value"> {
  data: SelectData<Value>;
  value?: Value;
  onChange: (newValue: Value) => void;
}

export function Select<Value extends string | null>(props: SelectProps<Value>) {
  return (
    // @ts-expect-error -- mine is better
    <MantineSelect {...props} />
  );
}
