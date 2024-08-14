/* eslint-disable react/prop-types */
import { SettingInputBlurChange } from "./SettingInput/SettingInput.styled";

const maybeSingletonList = value => (value ? [value] : null);

const SettingCommaDelimitedInput = ({
  setting,
  onChange,
  disabled,
  autoFocus,
  errorMessage,
  fireOnChange,
  id,
  type = "text",
}) => {
  return (
    <SettingInputBlurChange
      error={!!errorMessage}
      id={id}
      type={type}
      // TOOD: change this to support multiple email addresses
      // https://github.com/metabase/metabase/issues/22540
      value={setting.value ? setting.value[0] : ""}
      placeholder={setting.placeholder}
      // If the input's value is empty, setting.value should be null
      onChange={
        fireOnChange ? e => onChange(maybeSingletonList(e.target.value)) : null
      }
      onBlurChange={
        !fireOnChange ? e => onChange(maybeSingletonList(e.target.value)) : null
      }
      autoFocus={autoFocus}
    />
  );
};

export default SettingCommaDelimitedInput;
