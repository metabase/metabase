/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component, createRef } from "react";

import { PopoverWithTrigger } from "metabase/common/components/PopoverWithTrigger";
import { SelectButton } from "metabase/common/components/SelectButton";
import { ParameterTargetList } from "metabase/parameters/components/ParameterTargetList";
import { getMappingOptionByTarget } from "metabase/parameters/utils/mapping-options";

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
    const selected = getMappingOptionByTarget(mappingOptions, target, question);

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
          onChange={(target) => {
            onChange(target);
            this.popover.current.close();
          }}
          mappingOptions={mappingOptions}
          selectedMappingOption={selected}
        />
      </PopoverWithTrigger>
    );
  }
}
