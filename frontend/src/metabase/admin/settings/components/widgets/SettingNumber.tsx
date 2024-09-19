import { SettingInput } from "./SettingInput";
import type { SettingInputProps } from "./SettingInput/SettingInput";

const SettingNumber = (props: SettingInputProps) => (
  <SettingInput {...props} type="number" />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SettingNumber;
