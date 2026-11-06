import { type FocusEvent, type KeyboardEvent, useState } from "react";

import { isFocusVisible } from "metabase/utils/dom";

import type { SegmentedControlItem } from "./index";

/**
 * Tracks which item is hovered or keyboard-focused. `getTargetProps(value).opened`
 * is true for that item, so it should only open a tooltip the item actually has.
 */
export function useItemTooltip<Value extends string>(
  data: readonly Pick<SegmentedControlItem<Value>, "value">[],
) {
  const [hoveredValue, setHoveredValue] = useState<Value | null>(null);
  const [focusedValue, setFocusedValue] = useState<Value | null>(null);
  const activeTooltipValue = hoveredValue ?? focusedValue;

  const getItemValue = (target: EventTarget) => {
    if (!(target instanceof HTMLInputElement)) {
      return null;
    }

    const item = data.find((item) => item.value === target.value);
    return item?.value ?? null;
  };

  const handleFocus = (event: FocusEvent<HTMLElement>) => {
    // the tooltip only follows keyboard focus so it doesn't stay open after the pointer leaves.
    if (!isFocusVisible(event.target)) {
      return;
    }

    setHoveredValue(null);
    setFocusedValue(getItemValue(event.target));
  };

  const handleBlur = () => {
    setFocusedValue(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      setHoveredValue(null);
      setFocusedValue(null);
    }
  };

  const getTargetProps = (value: Value) => ({
    opened: activeTooltipValue === value,
    onMouseEnter: () => setHoveredValue(value),
    onMouseLeave: () => setHoveredValue(null),
  });

  return {
    getTargetProps,
    handleFocus,
    handleBlur,
    handleKeyDown,
  };
}
