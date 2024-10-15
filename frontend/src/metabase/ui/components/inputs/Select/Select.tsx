import {
  type ComboboxOptionProps,
  Select as MantineSelect,
  type SelectProps as MantineSelectProps,
} from "@mantine/core";
import { forwardRef } from "react";

import { type LegacyComboboxData, normalizeComboboxData } from "../Combobox";

export interface SelectProps
  extends Omit<MantineSelectProps, "data" | "onChange" | "nothingFound"> {
  data: LegacyComboboxData;
  onChange?: (value: any) => void;
  nothingFound?: string;
  withinPortal?: boolean;
  initiallyOpened?: boolean;
}

/** A version of Select that can receive Mantine-v6-style props
 *
 * TODO: Update all the onChange handlers in all the Selects
 */
export const Select = forwardRef<HTMLInputElement, SelectProps>(function Select(
  {
    data: legacySelectData,
    onChange: legacyOnChangeHandler,
    withinPortal,
    initiallyOpened,
    ...props
  }: SelectProps,
  ref,
) {
  const data: MantineSelectProps["data"] =
    normalizeComboboxData(legacySelectData);
  const onChange = (value: string | null, _option: ComboboxOptionProps) =>
    value && legacyOnChangeHandler?.(value);
  return (
    <MantineSelect
      {...props}
      comboboxProps={{ withinPortal }}
      onChange={onChange}
      data={data}
      nothingFoundMessage={props.nothingFound}
      defaultDropdownOpened={initiallyOpened}
      ref={ref}
    />
  );
});
