interface PrototypeSettingBase {
  /** Unique among the settings of a prototype. Values are stored per key. */
  key: string;
  label: string;
  description?: string;
}

export interface BooleanPrototypeSetting extends PrototypeSettingBase {
  type: "boolean";
  defaultValue: boolean;
}

export interface PrototypeSettingOption {
  value: string;
  label: string;
}

export interface SelectPrototypeSetting extends PrototypeSettingBase {
  type: "select";
  options: readonly PrototypeSettingOption[];
  defaultValue: string;
}

/** Like a select setting, but shows all options at once, for a few short options. */
export interface SegmentedPrototypeSetting extends PrototypeSettingBase {
  type: "segmented";
  options: readonly PrototypeSettingOption[];
  defaultValue: string;
}

export interface NumberPrototypeSetting extends PrototypeSettingBase {
  type: "number";
  defaultValue: number;
  min?: number;
  max?: number;
}

export interface TextPrototypeSetting extends PrototypeSettingBase {
  type: "text";
  defaultValue: string;
}

export type PrototypeSetting =
  | BooleanPrototypeSetting
  | SelectPrototypeSetting
  | SegmentedPrototypeSetting
  | NumberPrototypeSetting
  | TextPrototypeSetting;
