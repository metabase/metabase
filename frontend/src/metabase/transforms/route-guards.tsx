import { createRedirectGuard } from "metabase/route-guards";
import { getSetting } from "metabase/selectors/settings";
import * as Urls from "metabase/urls";

export const TransformsNotDisabled = createRedirectGuard(
  (state) =>
    !getSetting(state, "transforms-setup-complete") ||
    getSetting(state, "transforms-enabled"),
  Urls.dataStudioSettings(),
);
