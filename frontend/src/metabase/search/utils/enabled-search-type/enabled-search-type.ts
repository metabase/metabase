import { enabledSearchTypes } from "metabase/search/constants";
import type { EnabledSearchModel } from "metabase-types/api";

export function isEnabledSearchModelType(
  value: unknown,
): value is EnabledSearchModel {
  return (
    typeof value === "string" && enabledSearchTypes.some(type => type === value)
  );
}

export const filterEnabledSearchTypes = (
  values: unknown[],
): EnabledSearchModel[] => {
  return values.filter(isEnabledSearchModelType);
};
