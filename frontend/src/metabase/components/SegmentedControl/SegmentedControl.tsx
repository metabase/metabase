import type * as React from "react";
import { useMemo } from "react";
import _ from "underscore";

import type { IconName } from "metabase/ui";

import {
  ItemIcon,
  SegmentedControlRadio,
  SegmentedItem,
  SegmentedItemLabel,
  SegmentedList,
} from "./SegmentedControl.styled";

type SegmentedControlValue = string | number;

export type SegmentedControlOption<Value extends SegmentedControlValue> = {
  name?: React.ReactNode;
  value: Value;
  icon?: IconName;
  iconSize?: number;

  // Expects a color alias, not a color code
  // Example: brand, accent1, success
  // Won't work: red, #000, rgb(0, 0, 0)
  selectedColor?: string;
};

export interface SegmentedControlProps<Value extends SegmentedControlValue> {
  name?: string;
  value?: Value;
  options: SegmentedControlOption<Value>[];
  variant?: "fill-text" | "fill-background" | "fill-all";
  inactiveColor?: string;
  onChange?: (value: any) => void;
  fullWidth?: boolean;
}

const DEFAULT_OPTION_ICON_SIZE = 16;

export function SegmentedControl<Value extends SegmentedControlValue = number>({
  name: nameProp,
  value,
  options,
  onChange,
  fullWidth = false,
  inactiveColor = "text-dark",
  variant = "fill-background",
  ...props
}: SegmentedControlProps<Value>) {
  const id = useMemo(() => _.uniqueId("radio-"), []);
  const name = nameProp || id;
  const selectedOptionIndex = options.findIndex(
    option => option.value === value,
  );
  return (
    <SegmentedList {...props} role="radiogroup">
      {options.map((option, index) => {
        const isSelected = index === selectedOptionIndex;
        const id = `${name}-${option.value}`;
        const labelId = `${name}-${option.value}`;
        const iconOnly = !option.name;
        const selectedColor = option.selectedColor || "brand";
        return (
          <SegmentedItem
            key={option.value}
            isSelected={isSelected}
            index={index}
            total={options.length}
            selectedOptionIndex={selectedOptionIndex}
            fullWidth={fullWidth}
            variant={variant}
            selectedColor={selectedColor}
            inactiveColor={inactiveColor}
            role="radio"
            aria-checked={isSelected}
          >
            <SegmentedItemLabel
              id={labelId}
              isSelected={isSelected}
              variant={variant}
              selectedColor={selectedColor}
              inactiveColor={inactiveColor}
              compact={iconOnly}
            >
              {option.icon && (
                <ItemIcon
                  name={option.icon}
                  size={option.iconSize || DEFAULT_OPTION_ICON_SIZE}
                  iconOnly={iconOnly}
                />
              )}
              <SegmentedControlRadio
                id={id}
                name={name}
                value={option.value ?? ""}
                checked={isSelected}
                onChange={() => onChange?.(option.value)}
                // Workaround for https://github.com/testing-library/dom-testing-library/issues/877
                aria-labelledby={labelId}
              />
              {option.name}
            </SegmentedItemLabel>
          </SegmentedItem>
        );
      })}
    </SegmentedList>
  );
}
