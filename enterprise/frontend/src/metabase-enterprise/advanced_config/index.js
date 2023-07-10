import { t } from "ttag";
import _ from "underscore";
import { updateIn } from "icepick";
import { PLUGIN_ADMIN_SETTINGS_UPDATES } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

if (hasPremiumFeature("advanced_config")) {
  PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections =>
    updateIn(sections, ["email", "settings"], settings => {
      const index = settings.findIndex(({ key }) => key === "email-reply-to");

      return [
        ..._.head(settings, index + 1),
        {
          key: "subscription-allowed-domains",
          display_name: t`Approved domains for notifications`,
          type: "string",
        },
        {
          key: "user-visibility",
          display_name: t`Suggest recipients on dashboard subscriptions and alerts`,
          type: "select",
          options: [
            { value: "all", name: t`Suggest all users` },
            { value: "group", name: t`Only suggest users in the same groups` },
            { value: "none", name: t`Don't show suggestions` },
          ],
          defaultValue: "all",
        },
        ..._.tail(settings, index + 1),
      ];
    }),
  );
}
