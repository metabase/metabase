import type { Settings } from "metabase-types/api";

export interface FontSetting {
  value: string | null;
  default: string;
}

export type FontSettingKeys = "application-font" | "application-font-files";
export type FontSettingValues = Pick<Settings, FontSettingKeys>;
