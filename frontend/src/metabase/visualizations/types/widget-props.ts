import type { IconName } from "metabase-types/api";

// Prop contracts for setting widgets that settings definitions reference by
// string name. They live here rather than with the widget components so the
// type dependency runs UI -> core.

export type ChartSettingEnumToggleProps<T extends string> = {
  value: T | undefined;
  onChange: (value: T) => void;
  id?: string;
  checkedValue: T;
  uncheckedValue: T;
};

export type ChartSettingSegmentedControlProps = {
  options: { name: string; value: string; icon?: IconName }[];
  onChange: (value: string) => void;
  value: string;
};
