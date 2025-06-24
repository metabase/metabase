import type { FontFile, Settings } from "metabase-types/api";

export interface FontSetting {
  value: string | null;
  default: string;
}

export type FontSettingKeys = "application-font" | "application-font-files";
export type FontSettingValues = Pick<Settings, FontSettingKeys>;

export interface FontFilesSetting {
  value: FontFile[] | null;
}
export interface FontFileOption {
  name: string;
  fontWeight: number;
}
