/* @flow */

import React from "react";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import ParameterTargetList from "../components/ParameterTargetList";
import SelectButton from "metabase/components/SelectButton";

import _ from "underscore";
import cx from "classnames";

import type {
  ParameterMappingUIOption,
  ParameterTarget,
} from "metabase-types/types/Parameter";

type Props = {
  target: ?ParameterTarget,
  onChange: (target: ?ParameterTarget) => void,
  mappingOptions: ParameterMappingUIOption[],
  placeholder?: string,
  children?: React$Element<any> | (any => React$Element<any>),
};

export default class ParameterTargetWidget extends React.Component {
  props: Props;

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
        ref="popover"
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
            this.refs.popover.close();
          }}
          target={target}
          mappingOptions={mappingOptions}
        />
      </PopoverWithTrigger>
    );
  }
}
