import { FontFile } from "metabase-types/api";

export interface FontSetting {
  value: FontFile[] | null;
  defaultValue: FontFile[];
}

export interface FontFileOption {
  name: string;
  fontWeight: number;
}
