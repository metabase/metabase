import MetabaseSettings from "metabase/lib/settings";

export function areFieldFilterOperatorsEnabled() {
  return MetabaseSettings.get("field-filter-operators-enabled?");
}
