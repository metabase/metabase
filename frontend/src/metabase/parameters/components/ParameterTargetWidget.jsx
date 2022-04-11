/* eslint-disable react/prop-types */
import React from "react";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import ParameterTargetList from "../components/ParameterTargetList";
import SelectButton from "metabase/core/components/SelectButton";

import _ from "underscore";
import cx from "classnames";

export default class ParameterTargetWidget extends React.Component {
  constructor(props) {
    super(props);

    this.popover = React.createRef();
  }

  static defaultProps = {
    children: ({ selected, placeholder }) => (
      <SelectButton hasValue={!!selected} className="border-med">
        {selected ? selected.name : placeholder || "Select a target"}
      </SelectButton>
    ),
  };

  render() {
    const {
      target,
      onChange,
      mappingOptions,
      placeholder,
      children,
    } = this.props;

    const disabled = mappingOptions.length === 0;
    const selected = _.find(mappingOptions, o => _.isEqual(o.target, target));

    return (
      <PopoverWithTrigger
        ref={this.popover}
        triggerClasses={cx({ disabled: disabled })}
        sizeToFit
        triggerElement={
          typeof children === "function"
            ? children({ selected, disabled, placeholder })
            : children
        }
      >
        <ParameterTargetList
          onChange={target => {
            onChange(target);
            this.popover.current.close();
          }}
          target={target}
          mappingOptions={mappingOptions}
        />
      </PopoverWithTrigger>
    );
  }
}
