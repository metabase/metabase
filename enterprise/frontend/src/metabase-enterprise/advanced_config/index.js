import { updateIn } from "icepick";
import { t } from "ttag";
import { PLUGIN_ADMIN_SETTINGS_UPDATES } from "metabase/plugins";

PLUGIN_ADMIN_SETTINGS_UPDATES.push(sections =>
  updateIn(sections, ["email", "settings"], settings => [
    ...settings,
    {
      key: "subscription-allowed-domains",
      display_name: t`Approved domains for notifications`,
      type: "string",
      validations: [
        ["emailList", t`Looks like one of your domains isn’t valid`],
      ],
    },
  ]),
);
