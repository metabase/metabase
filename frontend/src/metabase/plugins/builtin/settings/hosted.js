import _ from "underscore";
import { updateIn } from "icepick";
import { t } from "ttag";
import MetabaseSettings from "metabase/lib/settings";
import { PLUGIN_ADMIN_SETTINGS_UPDATES } from "metabase/plugins";
import { SettingsCloudStoreLink } from "../../components/SettingsCloudStoreLink";

if (MetabaseSettings.isHosted()) {
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
