import { t } from "ttag";
import type { SearchSidebarFilterComponent } from "metabase/search/types";
import { TypeFilterContent } from "metabase/search/components/filters/TypeFilter/TypeFilterContent";
import { TypeFilterDisplay } from "metabase/search/components/filters/TypeFilter/TypeFilterDisplay";
import type { EnabledSearchModelType } from "metabase-types/api";
import { isEnabledSearchModelType } from "metabase/search/utils/enabled-search-type/enabled-search-type";

export const TypeFilter: SearchSidebarFilterComponent<"type"> = {
  iconName: "dashboard",
  title: t`Content type`,
  DisplayComponent: TypeFilterDisplay,
  ContentComponent: TypeFilterContent,
  fromUrl: value => {
    if (Array.isArray(value)) {
      return value.filter((v): v is EnabledSearchModelType =>
        isEnabledSearchModelType(v),
      );
    }
    return isEnabledSearchModelType(value) ? [value] : [];
  },
};
