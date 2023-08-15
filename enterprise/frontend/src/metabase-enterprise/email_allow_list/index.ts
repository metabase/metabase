import { t } from "ttag";
import { updateIn } from "icepick";

import { hasPremiumFeature } from "metabase-enterprise/settings";
import { PLUGIN_ADMIN_SETTINGS_UPDATES } from "metabase/plugins";
import { ADMIN_SETTINGS_SECTIONS } from "metabase/admin/settings/selectors";
import { SettingElement } from "metabase/admin/settings/types";

if (hasPremiumFeature("email_allow_list")) {
  PLUGIN_ADMIN_SETTINGS_UPDATES.push(
    (sections: typeof ADMIN_SETTINGS_SECTIONS) =>
      updateIn(
        sections,
        ["email", "settings"],
        (settings: SettingElement[]) => [
          ...settings,
          {
            key: "subscription-allowed-domains",
            display_name: t`Approved domains for notifications`,
            type: "string",
          },
        ],
      ),
  );
}
