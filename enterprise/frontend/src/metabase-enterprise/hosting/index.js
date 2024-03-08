import { updateIn } from "icepick";
import { t } from "ttag";
import _ from "underscore";

import { PLUGIN_ADMIN_SETTINGS_UPDATES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { SettingsCloudStoreLink } from "./components/SettingsCloudStoreLink";

if (hasPremiumFeature("hosting")) {
  PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections => _.omit(sections, ["updates"]));

  PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections =>
    updateIn(sections, ["general", "settings"], settings =>
      _.reject(settings, setting =>
        ["site-url", "redirect-all-requests-to-https"].includes(setting.key),
      ),
    ),
  );

  PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections => ({
    ...sections,
    cloud: {
      name: t`Cloud`,
      settings: [
        {
          key: "store-link",
          display_name: t`Cloud Settings`,
          widget: SettingsCloudStoreLink,
        },
      ],
    },
  }));
}
