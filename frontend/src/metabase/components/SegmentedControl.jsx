import React, { useMemo } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import Icon from "metabase/components/Icon";
import { SegmentedList, SegmentedItem } from "./SegmentedControl.styled";

const optionShape = PropTypes.shape({
  name: PropTypes.node.isRequired,
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
        return (
          <SegmentedItem
            key={option.value}
            isSelected={isSelected}
            isFirst={isFirst}
            isLast={isLast}
            onClick={e => onChange(option.value)}
            selectedColor={option.selectedColor || "brand"}
          >
            {option.icon && <Icon name={option.icon} mr={1} />}
            <input
              id={`${name}-${option.value}`}
              className="Form-radio"
              type="radio"
              name={name}
              value={option.value}
              checked={isSelected}
            />
            <span>{option.name}</span>
          </SegmentedItem>
        );
      })}
    </SegmentedList>
  );
}

SegmentedControl.propTypes = propTypes;
