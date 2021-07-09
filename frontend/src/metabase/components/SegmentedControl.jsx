import React, { useMemo } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import {
  SegmentedList,
  SegmentedItem,
  SegmentedControlRadio,
  ItemIcon,
} from "./SegmentedControl.styled";

const optionShape = PropTypes.shape({
  name: PropTypes.node,
  value: PropTypes.any.isRequired,
  icon: PropTypes.string,

  // Expects a color alias, not a color code
  // Example: brand, accent1, success
  // Won't work: red, #000, rgb(0, 0, 0)
  selectedColor: PropTypes.string,
});

const propTypes = {
  name: PropTypes.string,
  value: PropTypes.any,
  options: PropTypes.arrayOf(optionShape).isRequired,
  onChange: PropTypes.func,
};

export function SegmentedControl({
  name: nameFromProps,
  value,
  options,
  onChange,
  ...props
}) {
  const id = useMemo(() => _.uniqueId("radio-"), []);
  const name = nameFromProps || id;
  return (
    <SegmentedList {...props}>
      {options.map((option, index) => {
        const isSelected = option.value === value;
        const isFirst = index === 0;
        const isLast = index === options.length - 1;
        const id = `${name}-${option.value}`;
        const labelId = `${name}-${option.value}`;
        return (
          <li key={option.value}>
            <SegmentedItem
              id={labelId}
              isSelected={isSelected}
              isFirst={isFirst}
              isLast={isLast}
              selectedColor={option.selectedColor || "brand"}
            >
              {option.icon && (
                <ItemIcon name={option.icon} iconOnly={!option.name} />
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
            </SegmentedItem>
          </li>
        );
      })}
    </SegmentedList>
  );
}

SegmentedControl.propTypes = propTypes;
