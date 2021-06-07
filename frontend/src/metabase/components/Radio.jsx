import React, { Component } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import cx from "classnames";
import styled from "styled-components";
import { space } from "styled-system";

import { color, lighten } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

const propTypes = {
  name: PropTypes.string,
  value: PropTypes.any,
  options: PropTypes.array.isRequired,
  onChange: PropTypes.func,
  optionNameFn: PropTypes.func,
  optionValueFn: PropTypes.func,
  optionKeyFn: PropTypes.func,
  showButtons: PropTypes.bool,
  xspace: PropTypes.number,
  yspace: PropTypes.number,
  py: PropTypes.number,

  // Modes
  bubble: PropTypes.bool,
  vertical: PropTypes.bool,
  underlined: PropTypes.bool,
};

const defaultProps = {
  optionNameFn: option => option.name,
  optionValueFn: option => option.value,
  optionKeyFn: option => option.value,
  bubble: false,
  vertical: false,
  underlined: false,
};

class Radio extends Component {
  constructor(props, context) {
    super(props, context);
    this._id = _.uniqueId("radio-");
  }

  render() {
    const {
      name = this._id,
      value,
      options,
      onChange,
      optionNameFn,
      optionValueFn,
      optionKeyFn,
      vertical,
      underlined,
      bubble,
      xspace,
      yspace,
      py,
      showButtons = vertical && !bubble, // show buttons for vertical only by default
      ...props
    } = this.props;

    const [List, Item] = bubble
      ? [BubbleList, BubbleItem]
      : underlined
      ? [UnderlinedList, UnderlinedItem]
      : [NormalList, NormalItem];

    if (underlined && value === undefined) {
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
}

Radio.propTypes = propTypes;
Radio.defaultProps = defaultProps;

export default Radio;

// BASE components all variants inherit from
const BaseList = styled.ul`
  display: flex;
  flex-direction: ${props => (props.vertical ? "column" : "row")};
`;
const BaseItem = styled.li.attrs({
  mr: props => (!props.vertical && !props.last ? props.xspace : null),
  mb: props => (props.vertical && !props.last ? props.yspace : null),
  "aria-selected": props => props.selected,
})`
  ${space}
  display: flex;
  align-items: center;
  cursor: pointer;
  :hover {
    color: ${props =>
      !props.showButtons && !props.selected ? color("brand") : null};
  }
`;
BaseItem.defaultProps = {
  xspace: 3,
  yspace: 1,
};

// NORMAL
const NormalList = styled(BaseList).attrs({
  className: props => cx(props.className, { "text-bold": !props.showButtons }),
})``;
const NormalItem = styled(BaseItem)`
  color: ${props => (props.selected ? color("brand") : null)};
`;

// UNDERLINE
const UnderlinedList = styled(NormalList)``;
const UnderlinedItem = styled(NormalItem)`
  border-bottom: 3px solid transparent;
  border-color: ${props => (props.selected ? color("brand") : null)};
`;
UnderlinedItem.defaultProps = {
  py: 2,
};

// BUBBLE
const BubbleList = styled(BaseList)``;
const BubbleItem = styled(BaseItem)`
  font-weight: 700;
  border-radius: 99px;
  color: ${props => (props.selected ? color("white") : color("brand"))};
  background-color: ${props =>
    props.selected ? color("brand") : lighten("brand")};
  :hover {
    background-color: ${props => !props.selected && lighten("brand", 0.38)};
    transition: background 300ms linear;
  }
`;
BubbleItem.defaultProps = {
  xspace: 1,
  py: 1,
  px: 2,
};
