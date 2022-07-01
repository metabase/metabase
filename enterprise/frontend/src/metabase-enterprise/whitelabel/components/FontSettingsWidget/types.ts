import { Settings } from "metabase-types/api";

export type FontSettingKey = "application-font" | "application-font-files";
export type FontSettingValues = Pick<Settings, FontSettingKey>;
