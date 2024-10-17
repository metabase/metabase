import type {
  ComboboxItem,
  ComboboxItemGroup,
  SelectProps as MantineSelectProps,
} from "@mantine/core";
import { Select as MantineSelect } from "@mantine/core";

import type { IconName } from "../../icons";

export type ComboboxItemWithExtras<Value> = ComboboxItem & {
  value: Value;
  icon?: IconName;
} & Record<string, any>;

type SelectData<Value extends string | null> =
  | ComboboxItemWithExtras<Value>[]
  | ComboboxItemGroup<ComboboxItemWithExtras<Value>>[]
  | Value[];

/**
 * Mantine v7 loosened up the value types for Select, removing the generics, which sucks
 * This re-introduces the value generics to keep the type safety
 */
export interface SelectProps<Value extends string | null>
  extends Omit<MantineSelectProps, "data" | "onChange" | "value"> {
  data: SelectData<Value>;
  value: Value;
  onChange: (newValue: Value) => void;
}

export function Select<Value extends string | null>(props: SelectProps<Value>) {
  return (
    // @ts-expect-error -- mine is better
    <MantineSelect {...props} />
  );
}
