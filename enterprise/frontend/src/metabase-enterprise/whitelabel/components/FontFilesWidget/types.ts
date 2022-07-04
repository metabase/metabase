import { FontFile } from "metabase-types/api";

export interface FontFilesSetting {
  value: FontFile[] | null;
  defaultValue: FontFile[];
}

export interface FontFileOption {
  name: string;
  fontWeight: number;
}
