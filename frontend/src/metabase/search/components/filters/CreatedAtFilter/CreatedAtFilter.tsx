import { t } from "ttag";
import { CreatedAtDisplay } from "metabase/search/components/filters/CreatedAtFilter/CreatedAtDisplay";
import { CreatedAtContent } from "metabase/search/components/filters/CreatedAtFilter/CreatedAtContent";
import type {SearchFilterComponent} from "metabase/search/types";

export const CreatedAtFilter: SearchFilterComponent<"created_at"> = {
  iconName: "person",
  title: t`Creation Date`,
  type: "dropdown",
  DisplayComponent: CreatedAtDisplay,
  ContentComponent: CreatedAtContent,
};
