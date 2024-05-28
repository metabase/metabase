import { updateIn } from "icepick";
import { t } from "ttag";

import type { ADMIN_SETTINGS_SECTIONS } from "metabase/admin/settings/selectors";
import type { SettingElement } from "metabase/admin/settings/types";
import { PLUGIN_ADMIN_SETTINGS_UPDATES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

if (hasPremiumFeature("email_restrict_recipients")) {
  PLUGIN_ADMIN_SETTINGS_UPDATES.push(
    (sections: typeof ADMIN_SETTINGS_SECTIONS) =>
      updateIn(
        sections,
        ["email", "settings"],
        (settings: SettingElement[]) => [
          ...settings,
          {
            key: "user-visibility",
            display_name: t`Suggest recipients on dashboard subscriptions and alerts`,
            type: "select",
            options: [
              { value: "all", name: t`Suggest all users` },
              {
                value: "group",
                name: t`Only suggest users in the same groups`,
              },
              { value: "none", name: t`Don't show suggestions` },
            ],
            defaultValue: "all",
          },
        ],
      ),
  );
}
