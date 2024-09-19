import { SettingInput } from "./SettingInput";
import type { SettingInputProps } from "./SettingInput/SettingInput";

const SettingPassword = (props: SettingInputProps) => (
  <SettingInput {...props} type="password" />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SettingPassword;
