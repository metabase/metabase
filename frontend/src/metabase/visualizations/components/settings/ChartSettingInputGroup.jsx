/* eslint-disable react/prop-types */
import cx from "classnames";

import InputBlurChange from "metabase/components/InputBlurChange";
import CS from "metabase/css/core/index.css";

// value is an array of strings. This component provides one input box per string
export default function ChartSettingInputGroup({ value: values, onChange }) {
  const inputs = values.map((str, i) => (
    <InputBlurChange
      key={i}
      className={cx(CS.block, CS.full, CS.mb1)}
      value={str}
      onBlurChange={e => {
        const newStr = e.target.value.trim();
        if (!newStr || !newStr.length) {
          return;
        }
        // clone the original values array. It's read-only so we can't just replace the one value we want
        const newValues = values.slice();
        newValues[i] = newStr;
        onChange(newValues);
      }}
    />
  ));

  return <div>{inputs}</div>;
}
