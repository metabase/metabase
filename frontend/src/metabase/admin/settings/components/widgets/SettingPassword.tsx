import { SettingInput } from "./SettingInput";
import { SettingInputProps } from "./SettingInput/SettingInput";

const SettingPassword = (props: SettingInputProps) => (
  <SettingInput {...props} type="password" />
);

export default SettingPassword;
