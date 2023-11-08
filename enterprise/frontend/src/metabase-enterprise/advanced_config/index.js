import { t } from "ttag";
import _ from "underscore";
import { updateIn } from "icepick";
import { PLUGIN_ADMIN_SETTINGS_UPDATES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

if (hasPremiumFeature("advanced_config")) {
  PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections =>
    updateIn(sections, ["general", "settings"], settings => {
      const index = settings.findIndex(({ key }) => key === "admin-email");

      return [
        ..._.head(settings, index + 1),
        {
          key: "subscription-allowed-domains",
          display_name: t`Approved domains for notifications`,
          type: "string",
        },
        ..._.tail(settings, index + 1),
      ];
    }),
  );
}
