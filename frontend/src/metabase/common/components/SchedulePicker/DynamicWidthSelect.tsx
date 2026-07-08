import { useMemo } from "react";

import { useSelector } from "metabase/redux";
import { getSetting } from "metabase/selectors/settings";
import type { SelectProps } from "metabase/ui";
import { Select } from "metabase/ui";

import {
  getLongestSelectLabel,
  measureTextWidthSafely,
} from "../Schedule/utils";

// Icon + padding + extra buffer + scrollbar (for dropdown)
const BUFFER = 60;

// Use when somehow `measureTextWidthSafely` fails
const DEFAULT_WIDTH = 50;

const MIN_DROPDOWN_WIDTH = 150;

/**
 * A Select component with independent width calculations for button and dropdown.
 * - Button width: Based on currently selected option (with optional min-width)
 * - Dropdown width: Based on longest option in the list
 *
 * Created specifically for SchedulePicker (which is deprecated).
 */
export const DynamicWidthSelect = <Value extends string = string>({
  value,
  minButtonWidth,
  ...props
}: Omit<
  SelectProps<Value>,
  "value" | "onChange" | "comboboxProps" | "styles"
> & {
  value: Value | null | undefined;
  onChange: (newValue: Value | null) => void;
  minButtonWidth?: number;
}) => {
  const fontFamily = useSelector((state) =>
    getSetting(state, "application-font"),
  );

  const { buttonWidth, dropdownWidth } = useMemo(() => {
    const fontStyle = { family: fontFamily };

    // Calculate button width based on selected value
    const selectedLabel = getSelectedLabel(props.data, value);
    const measuredButtonWidth =
      measureTextWidthSafely(selectedLabel, DEFAULT_WIDTH, fontStyle) + BUFFER;
    const buttonWidth = Math.max(measuredButtonWidth, minButtonWidth || 0);

    // Calculate dropdown width based on longest option
    const longestLabel = getLongestSelectLabel(props.data);
    const dropdownWidth =
      measureTextWidthSafely(longestLabel, DEFAULT_WIDTH, fontStyle) + BUFFER;

    return { buttonWidth, dropdownWidth };
  }, [props.data, value, fontFamily, minButtonWidth]);

  return (
    <Select
      styles={{
        wrapper: { width: buttonWidth },
      }}
      comboboxProps={{
        position: "bottom-end",
        width: Math.max(MIN_DROPDOWN_WIDTH, dropdownWidth),
      }}
      value={value}
      {...props}
    />
  );
};

const getSelectedLabel = (
  data: SelectProps["data"],
  value: string | null | undefined,
): string => {
  if (!value) {
    return "";
  }
  for (const option of data) {
    if (
      typeof option === "object" &&
      option &&
      "value" in option &&
      option.value === value
    ) {
      return option.label;
    }
  }
  return value;
};
