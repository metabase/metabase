/* eslint-disable react/prop-types */
import Radio from "metabase/core/components/Radio";

const ChartSettingRadio = ({ value, onChange, options = [], className }) => (
  <Radio
    className={className}
    value={value}
    onChange={onChange}
    options={options}
    vertical
  />
);

export default ChartSettingRadio;
