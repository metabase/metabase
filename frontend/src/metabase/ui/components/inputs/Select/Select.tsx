import type {
  ComboboxItem,
  ComboboxItemGroup,
  SelectProps as MantineSelectProps,
} from "@mantine/core";
import { Select as MantineSelect } from "@mantine/core";
import { type Ref, forwardRef } from "react";

import type { IconName } from "../../icons";

export type { DataAttributes, InputDescriptionProps } from "@mantine/core";
export * from "./SelectItem";

export type SelectOption<Value = string | null> = ComboboxItem & {
  value: Value;
  icon?: IconName;
} & Record<string, any>;

export type SelectData<Value extends string | null> =
  | SelectOption<Value>[]
  | ComboboxItemGroup<SelectOption<Value>>[]
  | Value[];

/**
 * Mantine v7 loosened up the value types for Select, removing the generics, which sucks
 * This re-introduces the value generics to keep the type safety
 */
export interface SelectProps<Value extends string | null = string>
  extends Omit<MantineSelectProps, "data" | "onChange" | "value" | "ref"> {
  data: SelectData<Value>;
  value?: Value;
  onChange?: (newValue: Value) => void;
}

function _Select<Value extends string | null>(
  props: SelectProps<Value>,
  ref: Ref<HTMLElement>,
) {
  return (
    // @ts-expect-error -- our tighter types are better
    <MantineSelect {...props} ref={ref} />
  );
}

// forwardRef is hard to type with generics
// see https://stackoverflow.com/questions/58469229/react-with-typescript-generics-while-using-react-forwardref
export const Select = forwardRef(_Select) as <Value extends string | null>(
  props: SelectProps<Value> & { ref?: Ref<HTMLElement> },
) => React.ReactNode;
