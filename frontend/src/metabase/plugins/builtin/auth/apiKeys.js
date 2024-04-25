import { updateIn } from "icepick";

import { ApiKeysAuthCard } from "metabase/admin/settings/auth/components/ApiKeysAuthCard";
import { ManageApiKeys } from "metabase/admin/settings/components/ApiKeys/ManageApiKeys";
import { PLUGIN_ADMIN_SETTINGS_UPDATES } from "metabase/plugins";

PLUGIN_ADMIN_SETTINGS_UPDATES.push(
  sections =>
    updateIn(sections, ["authentication", "settings"], settings => [
      ...settings,
      {
        key: "api-keys",
        description: null,
        noHeader: true,
        widget: ApiKeysAuthCard,
      },
    ]),
  sections => ({
    ...sections,
    "authentication/api-keys": {
      component: ManageApiKeys,
      settings: [],
    },
  }),
);
