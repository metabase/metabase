import { type FocusEvent, type KeyboardEvent, useState } from "react";

import { isFocusVisible } from "metabase/utils/dom";

import type { SegmentedControlItem } from "./index";

type TooltipItem<Value extends string> = Pick<
  SegmentedControlItem<Value>,
  "value" | "withTooltip"
>;

export function useItemTooltip<Value extends string>(
  data: readonly TooltipItem<Value>[],
) {
  const [hoveredValue, setHoveredValue] = useState<Value | null>(null);
  const [focusedValue, setFocusedValue] = useState<Value | null>(null);
  const activeTooltipValue = hoveredValue ?? focusedValue;
  const hasTooltipItems = data.some((item) => item.withTooltip);

  const getTooltipItemValue = (target: EventTarget) => {
    if (!(target instanceof HTMLInputElement)) {
      return null;
    }

    const item = data.find(
      (item) => item.withTooltip && item.value === target.value,
    );
    return item?.value ?? null;
  };

  const handleFocus = (event: FocusEvent<HTMLElement>) => {
    // the tooltip only follows keyboard focus so it doesn't stay open after the pointer leaves.
    if (!isFocusVisible(event.target)) {
      return;
    }

    setHoveredValue(null);
    setFocusedValue(getTooltipItemValue(event.target));
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
    hasTooltipItems,
    getTargetProps,
    handleFocus,
    handleBlur,
    handleKeyDown,
  };
}
