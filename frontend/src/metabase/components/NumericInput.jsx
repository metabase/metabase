/* @flow */

import React from "react";

import InputBlurChange from "metabase/components/InputBlurChange";

type Props = {
  value: ?(number | string),
  onChange: (value: ?number) => void,
};

const NumericInput = ({ value, onChange, ...props }: Props) => (
  <InputBlurChange
    value={value == null ? "" : String(value)}
    onBlurChange={({ target: { value } }) => {
      value = value ? parseFloat(value) : null;
      if (!isNaN(value)) {
        onChange(value);
      }
    }}
    {...props}
  />
);

export default NumericInput;
