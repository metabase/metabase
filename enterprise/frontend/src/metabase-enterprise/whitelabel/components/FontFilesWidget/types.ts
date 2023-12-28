import type { FontFile } from "metabase-types/api";

export interface FontFilesSetting {
  value: FontFile[] | null;
}

export interface FontFileOption {
  name: string;
  fontWeight: number;
}
