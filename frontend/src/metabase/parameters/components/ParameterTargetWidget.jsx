/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component, createRef } from "react";
import _ from "underscore";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import SelectButton from "metabase/core/components/SelectButton";
import { getMappingOptionByTarget } from "metabase/parameters/utils/mapping-options";

import ParameterTargetList from "../components/ParameterTargetList";

export default class ParameterTargetWidget extends Component {
  constructor(props) {
    super(props);

    this.popover = createRef();
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
      question,
      target,
      onChange,
      mappingOptions,
      placeholder,
      children,
    } = this.props;

    const disabled = mappingOptions.length === 0;
    const selectedMappingOption = getMappingOptionByTarget(
      mappingOptions,
      target,
      question,
    );
    const selected = selectedMappingOption != null;

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
