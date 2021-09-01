import React, { useMemo } from "react";
import PropTypes from "prop-types";
import _ from "underscore";

import Icon from "metabase/components/Icon";
import {
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
  options: PropTypes.arrayOf(optionShape).isRequired,
  onChange: PropTypes.func,
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
  value,
  options,
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

  if (variant === "underlined" && value === undefined) {
    console.warn(
      "Radio can't underline selected option when no value is given.",
    );
  }

  return (
    <List {...props} vertical={vertical} showButtons={showButtons}>
      {options.map((option, index) => {
        const selected = value === optionValueFn(option);
        const last = index === options.length - 1;
        return (
          <Item
            key={optionKeyFn(option)}
            selected={selected}
            last={last}
            vertical={vertical}
            showButtons={showButtons}
            py={py}
            xspace={xspace}
            yspace={yspace}
            onClick={e => onChange(optionValueFn(option))}
            aria-selected={selected}
          >
            {option.icon && <Icon name={option.icon} mr={1} />}
            <input
              className="Form-radio"
              type="radio"
              name={name}
              value={optionValueFn(option)}
              checked={selected}
              id={name + "-" + optionKeyFn(option)}
            />
            {showButtons && (
              <label htmlFor={name + "-" + optionKeyFn(option)} />
            )}
            <span>{optionNameFn(option)}</span>
          </Item>
        );
      })}
    </List>
  );
}

Radio.propTypes = propTypes;

export default Radio;
