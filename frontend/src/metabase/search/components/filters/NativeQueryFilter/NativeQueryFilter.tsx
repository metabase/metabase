import type { SearchFilterToggle } from "metabase/common/search/types";
import { NativeQueryLabel } from "metabase/search/components/filters/NativeQueryFilter/NativeQueryLabel";

export const NativeQueryFilter: SearchFilterToggle = {
  label: NativeQueryLabel,
  type: "toggle",
  fromUrl: (value) => value === "true",
  toUrl: (value: boolean) => (value ? "true" : null),
};
