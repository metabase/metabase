import type { ComponentType, ReactNode } from "react";

import type {
  SettingDefinition,
  SettingKey,
  SettingValue,
  Settings,
} from "metabase-types/api";

export type SettingElement<Key extends SettingKey = SettingKey> =
  SettingDefinition<Key> & {
    tab?: string;
    display_name?: string;
    type?: string;
    description?: string | ReactNode;
    note?: string;
    searchProp?: string;
    placeholder?: string;
    options?: { value: SettingValue<Key>; name: string }[];
    originalValue?: SettingValue<Key>;
    defaultValue?: SettingValue<Key>;
    required?: boolean;
    autoFocus?: boolean;
    showActualValue?: boolean;
    allowValueCollection?: boolean;
    noHeader?: boolean;
    disableDefaultUpdate?: boolean;
    validations?: [string, string][];
    widget?: ComponentType<any>;
    warningMessage?: string;
    postUpdateActions?: VoidFunction[];
    getProps?: (setting: SettingDefinition<Key>) => Record<string, any>;
    getHidden?: (
      settingValues: Settings,
      derivedSettingValues: Settings,
    ) => boolean;
    onChanged?: (
      oldValue: SettingValue<Key> | null,
      newValue: SettingValue<Key> | null,
      settingsValues: Settings,
      handleChangeSetting: (key: Key, value: SettingValue<Key>) => void,
    ) => void;
    onBeforeChanged?: (
      oldValue: SettingValue<Key> | null,
      newValue: SettingValue<Key> | null,
    ) => void;
  };
