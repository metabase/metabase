import _ from "underscore";

import { PLUGIN_ADMIN_SETTINGS_UPDATES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

if (hasPremiumFeature("hosting")) {
  PLUGIN_ADMIN_SETTINGS_UPDATES.push((sections) =>
    _.omit(sections, ["updates"]),
  );
}
