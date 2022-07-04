import { FontFile } from "metabase-types/api";

export interface FontSetting {
  value: FontFile[] | null;
}

export interface FontFileOption {
  name: string;
  fontWeight: number;
}
