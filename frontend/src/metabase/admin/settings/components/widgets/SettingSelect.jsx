/* eslint-disable react/prop-types */
import { Select } from "metabase/ui";

const SettingSelect = ({
  className = "",
  setting: { placeholder, value, options, defaultValue, searchProp, key },
  options: customOptions = options,
  onChange,
  disabled = false,
}) => (
  <>
    <Select
      className={className}
      placeholder={placeholder}
      value={value ?? defaultValue}
      disabled={disabled}
      searchProp={searchProp}
      onChange={value => onChange(value)}
      buttonProps={{
        dataTestId: key,
      }}
      data={customOptions.map(option => {
        return {
          label: option.name,
          value: option.value,
        };
      })}
    />
  </>
);

export default SettingSelect;
