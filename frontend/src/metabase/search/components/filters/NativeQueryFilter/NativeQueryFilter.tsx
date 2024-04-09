import { NativeQueryLabel } from "metabase/search/components/filters/NativeQueryFilter/NativeQueryLabel";
import type { SearchFilterToggle } from "metabase/search/types";

export const NativeQueryFilter: SearchFilterToggle = {
  label: NativeQueryLabel,
  type: "toggle",
  fromUrl: value => value === "true",
  toUrl: (value: boolean) => (value ? "true" : null),
};
