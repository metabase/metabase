import { t } from "ttag";
import type { SearchSidebarFilterComponent } from "metabase/search/types";
import { CreatedAtDisplay } from "metabase/search/components/filters/CreatedAtFilter/CreatedAtDisplay";
import { CreatedAtContent } from "metabase/search/components/filters/CreatedAtFilter/CreatedAtContent";

export const CreatedAtFilter: SearchSidebarFilterComponent<"created_at"> = {
  iconName: "person",
  title: t`Creation Date`,
  DisplayComponent: CreatedAtDisplay,
  ContentComponent: CreatedAtContent,
};
