import { t } from "ttag";
import type { SearchSidebarFilterComponent } from "metabase/search/types";
import { TypeFilterContent } from "metabase/search/components/filters/TypeFilter/TypeFilterContent";
import { TypeFilterDisplay } from "metabase/search/components/filters/TypeFilter/TypeFilterDisplay";
import { enabledSearchTypes } from "metabase/search/constants";
import type { EnabledSearchModelType } from "metabase-types/api";

export const TypeFilter: SearchSidebarFilterComponent<"type"> = {
  iconName: "dashboard",
  title: t`Content type`,
  DisplayComponent: TypeFilterDisplay,
  ContentComponent: TypeFilterContent,
  fromUrl: value => {
    const castedValue = value as
      | EnabledSearchModelType
      | EnabledSearchModelType[];
    if (Array.isArray(castedValue)) {
      return castedValue.filter(type => enabledSearchTypes.includes(type));
    }
    return castedValue && enabledSearchTypes.includes(castedValue)
      ? [castedValue]
      : [];
  },
  toUrl: value => value,
};
