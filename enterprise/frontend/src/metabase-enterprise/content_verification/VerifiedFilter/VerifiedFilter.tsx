import { t } from "ttag";
import type { SearchFilterComponent } from "metabase/search/types";
import { VerifiedFilterDisplay } from "metabase-enterprise/content_verification/VerifiedFilter/VerifiedFilterDisplay";

export const VerifiedFilter: SearchFilterComponent<"verified"> = {
  title: t`Verified`,
  type: "toggle",
  Component: VerifiedFilterDisplay,
};
