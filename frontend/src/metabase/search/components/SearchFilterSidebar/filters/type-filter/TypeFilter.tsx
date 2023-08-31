/* eslint-disable react/prop-types */
import { t } from "ttag";
import type { SearchSidebarFilterComponent } from "metabase/search/types";
import { TypeFilterContent } from "metabase/search/components/SearchFilterSidebar/filters/type-filter/TypeFilterContent";
import { TypeFilterDisplay } from "metabase/search/components/SearchFilterSidebar/filters/type-filter/TypeFilterDisplay";

export const TypeFilter: SearchSidebarFilterComponent<"type"> = {
  iconName: "dashboard",
  title: t`Content type`,
  DisplayComponent: TypeFilterDisplay,
  ContentComponent: TypeFilterContent,
};
