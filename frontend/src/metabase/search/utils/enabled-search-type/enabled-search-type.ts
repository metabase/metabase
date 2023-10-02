import type { EnabledSearchModelType } from "metabase-types/api";
import { enabledSearchTypes } from "metabase/search/constants";

export function isEnabledSearchModelType(
  value: unknown,
): value is EnabledSearchModelType {
  return (
    typeof value === "string" && enabledSearchTypes.some(type => type === value)
  );
}

export const filterEnabledSearchTypes = (
  values: unknown[],
): EnabledSearchModelType[] => {
  return values.filter(isEnabledSearchModelType);
};
