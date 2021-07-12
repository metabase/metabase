import React, { useMemo } from "react";
import PropTypes from "prop-types";
import _ from "underscore";

import Icon from "metabase/components/Icon";
import {
  RadioInput,
  RadioButton,
  BubbleList,
  BubbleItem,
  NormalList,
  NormalItem,
  UnderlinedList,
  UnderlinedItem,
} from "./Radio.styled";

const optionShape = PropTypes.shape({
  name: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.element,
    PropTypes.node,
  ]).isRequired,
  value: PropTypes.any.isRequired,
  icon: PropTypes.string,
});

const propTypes = {
  name: PropTypes.string,
  value: PropTypes.any,
  options: PropTypes.oneOfType([
    PropTypes.arrayOf(PropTypes.string),
    PropTypes.arrayOf(optionShape),
  ]).isRequired,
  onChange: PropTypes.func,
  onOptionClick: PropTypes.func,
  optionNameFn: PropTypes.func,
  optionValueFn: PropTypes.func,
  optionKeyFn: PropTypes.func,
  showButtons: PropTypes.bool,
  xspace: PropTypes.number,
  yspace: PropTypes.number,
  py: PropTypes.number,

  // Modes
  variant: PropTypes.oneOf(["bubble", "normal", "underlined"]),
  vertical: PropTypes.bool,
};

const defaultNameGetter = option => option.name;
const defaultValueGetter = option => option.value;

const VARIANTS = {
  normal: [NormalList, NormalItem],
  bubble: [BubbleList, BubbleItem],
  underlined: [UnderlinedList, UnderlinedItem],
};

function Radio({
  name: nameFromProps,
  value: currentValue,
  options,

  // onChange won't fire when you click an already checked item
  // onOptionClick will fire in any case
  // onOptionClick can be used for e.g. tab navigation like on the admin Permissions page)
  onOptionClick,
  onChange,

  optionNameFn = defaultNameGetter,
  optionValueFn = defaultValueGetter,
  optionKeyFn = defaultValueGetter,
  variant = "normal",
  vertical = false,
  xspace,
  yspace,
  py,
  showButtons = vertical && variant !== "bubble",
  ...props
}) {
  const id = useMemo(() => _.uniqueId("radio-"), []);
  const name = nameFromProps || id;

  const [List, Item] = VARIANTS[variant] || VARIANTS.normal;

  if (variant === "underlined" && currentValue === undefined) {
    console.warn(
      "Radio can't underline selected option when no value is given.",
    );
  }

  return (
    <List {...props} vertical={vertical} showButtons={showButtons}>
      {options.map((option, index) => {
        const value = optionValueFn(option);
        const selected = currentValue === value;
        const last = index === options.length - 1;
        const key = optionKeyFn(option);
        const id = `${name}-${key}`;
        const labelId = `${id}-label`;
        return (
          <li key={key}>
            <Item
              id={labelId}
              htmlFor={id}
              selected={selected}
              last={last}
              vertical={vertical}
              showButtons={showButtons}
              py={py}
              xspace={xspace}
              yspace={yspace}
              onClick={() => {
                if (typeof onOptionClick === "function") {
                  onOptionClick(value);
                }
              }}
            >
              {option.icon && <Icon name={option.icon} mr={1} />}
              <RadioInput
                id={id}
                name={name}
                value={value}
                checked={selected}
                onChange={() => {
                  if (typeof onChange === "function") {
                    onChange(value);
                  }
                }}
                // Workaround for https://github.com/testing-library/dom-testing-library/issues/877
                aria-labelledby={labelId}
              />
              {showButtons && <RadioButton checked={selected} />}
              {optionNameFn(option)}
            </Item>
          </li>
        );
      })}
    </List>
  );
}

Radio.propTypes = propTypes;

export default Radio;
