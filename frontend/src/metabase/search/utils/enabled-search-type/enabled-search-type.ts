import type { EnabledSearchModelType } from "metabase-types/api";
import { enabledSearchTypes } from "metabase/search/constants";

export function isEnabledSearchModelType(
  value: any,
): value is EnabledSearchModelType {
  return (
    typeof value === "string" && enabledSearchTypes.some(type => type === value)
  );
}
