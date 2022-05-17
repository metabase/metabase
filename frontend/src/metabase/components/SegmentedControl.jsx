import React, { useMemo } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import {
  SegmentedList,
  SegmentedItem,
  SegmentedItemLabel,
  SegmentedControlRadio,
  ItemIcon,
} from "./SegmentedControl.styled";

export const optionShape = PropTypes.shape({
  name: PropTypes.node,
  value: PropTypes.any,
  icon: PropTypes.string,
  iconSize: PropTypes.number,

  // Expects a color alias, not a color code
  // Example: brand, accent1, success
  // Won't work: red, #000, rgb(0, 0, 0)
  selectedColor: PropTypes.string,
});

const propTypes = {
  name: PropTypes.string,
  value: PropTypes.any,
  options: PropTypes.arrayOf(optionShape).isRequired,
  variant: PropTypes.oneOf(["fill-text", "fill-background", "fill-all"]),
  inactiveColor: PropTypes.string,
  onChange: PropTypes.func,
  fullWidth: PropTypes.bool,
};

const DEFAULT_OPTION_ICON_SIZE = 16;

export function SegmentedControl({
  name: nameFromProps,
  value,
  options,
  onChange,
  fullWidth = false,
  inactiveColor = "text-medium",
  variant = "fill-text",
  ...props
}) {
  const id = useMemo(() => _.uniqueId("radio-"), []);
  const name = nameFromProps || id;
  return (
    <SegmentedList {...props} fullWidth={fullWidth}>
      {options.map((option, index) => {
        const isSelected = option.value === value;
        const isFirst = index === 0;
        const isLast = index === options.length - 1;
        const id = `${name}-${option.value}`;
        const labelId = `${name}-${option.value}`;
        const iconOnly = !option.name;
        const selectedColor = option.selectedColor || "brand";
        return (
          <SegmentedItem
            key={option.value}
            isSelected={isSelected}
            isFirst={isFirst}
            isLast={isLast}
            fullWidth={fullWidth}
            variant={variant}
            selectedColor={selectedColor}
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
                value={option.value}
                checked={isSelected}
                onChange={() => onChange(option.value)}
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

SegmentedControl.propTypes = propTypes;
