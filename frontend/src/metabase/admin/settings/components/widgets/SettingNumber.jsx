/* eslint-disable react/prop-types */
import { SettingInput } from "./SettingInput";

const SettingNumber = ({ type = "number", ...props }) => (
  <SettingInput {...props} type="number" />
);

export default SettingNumber;
