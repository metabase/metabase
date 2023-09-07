import { t } from "ttag";
import type { SearchSidebarFilterComponent } from "metabase/search/types";
import { CreatedByDisplay } from "metabase/search/components/filters/CreatedByFilter/CreatedByDisplay";
import { CreatedByContent } from "metabase/search/components/filters/CreatedByFilter/CreatedByContent";

export const CreatedByFilter: SearchSidebarFilterComponent<"created_by"> = {
  iconName: "person",
  title: t`Creator`,
  DisplayComponent: CreatedByDisplay,
  ContentComponent: CreatedByContent,
};
