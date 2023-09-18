import { t } from "ttag";
import type { SearchFilterComponent } from "metabase/search/types";
import { TypeFilterContent } from "metabase/search/components/filters/TypeFilter/TypeFilterContent";
import { TypeFilterDisplay } from "metabase/search/components/filters/TypeFilter/TypeFilterDisplay";

export const TypeFilter: SearchFilterComponent<"type"> = {
  iconName: "dashboard",
  title: t`Content type`,
  type: "dropdown",
  DisplayComponent: TypeFilterDisplay,
  ContentComponent: TypeFilterContent,
};
