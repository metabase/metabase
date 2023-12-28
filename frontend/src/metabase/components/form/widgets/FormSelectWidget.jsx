/* eslint-disable react/prop-types */
import Select, { Option } from "metabase/core/components/Select";

const FormSelectWidget = ({ placeholder, options = [], field, disabled }) => (
  <Select
    placeholder={placeholder}
    {...field}
    // react-redux expects to be raw value
    onChange={e => field.onChange(e.target.value)}
    disabled={disabled}
    buttonProps={{ style: { minWidth: 200 } }}
  >
    {options.map(({ name, value, icon }) => (
      <Option key={value} value={value} icon={icon}>
        {name}
      </Option>
    ))}
  </Select>
);

export default FormSelectWidget;
