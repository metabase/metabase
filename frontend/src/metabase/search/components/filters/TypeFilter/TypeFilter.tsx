/* eslint-disable react/prop-types */
import { t } from "ttag";
import type { SearchSidebarFilterComponent } from "metabase/search/types";
import { TypeFilterContent } from "metabase/search/components/filters/TypeFilter/TypeFilterContent";
import { TypeFilterDisplay } from "metabase/search/components/filters/TypeFilter/TypeFilterDisplay";

export const TypeFilter: SearchSidebarFilterComponent<"type"> = {
  iconName: "dashboard",
  title: t`Content type`,
  DisplayComponent: TypeFilterDisplay,
  ContentComponent: TypeFilterContent,
};
