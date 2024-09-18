/* eslint-disable react/prop-types */
import { SettingInput } from "./SettingInput";
import { SettingInputProps } from "./SettingInput/SettingInput";

const SettingNumber = ({ type = "number", ...props }: SettingInputProps) => (
  <SettingInput {...props} type="number" />
);

export default SettingNumber;
