import type { ReactElement } from "react";
import type {
  SettingDefinition,
  SettingKey,
  SettingValue,
  Settings,
} from "metabase-types/api";

export type SettingElement = {
  key?: SettingKey;
  display_name?: string;
  type?: string;
  description?: string;
  note?: string;
  searchProp?: string;
  placeholder?: string;
  options?: { value: SettingValue; name: string }[];
  defaultValue?: SettingValue;
  required?: boolean;
  autoFocus?: boolean;
  showActualValue?: boolean;
  allowValueCollection?: boolean;
  noHeader?: boolean;
  disableDefaultUpdate?: boolean;
  validations?: [string, string][];
  widget?: ReactElement;
  warningMessage?: string;
  postUpdateActions?: VoidFunction[];
  getProps?: (setting: SettingDefinition) => Record<string, any>;
  getHidden?: (
    settingValues: Settings,
    derivedSettingValues: Settings,
  ) => boolean;
  onChanged?: (
    oldValue: string,
    newValue: string,
    settingsValues: Settings,
    handleChangeSetting: (key: string, value: string) => void,
  ) => void;
  onBeforeChanged?: (oldValue: string, newValue: string) => void;
};
