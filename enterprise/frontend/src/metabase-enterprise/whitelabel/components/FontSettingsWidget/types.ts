import { FontFile } from "metabase-types/api";

export interface FontSetting {
  value: string | null;
}

export interface FontValues {
  "application-font-files": FontFile[];
}
