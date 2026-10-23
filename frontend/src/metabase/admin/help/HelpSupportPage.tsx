import { t } from "ttag";

import { PLUGIN_SUPPORT } from "metabase/plugins";
import { Outlet } from "metabase/router";
import { SettingsPageWrapper } from "metabase/settings-components";

export const HelpSupportPage = () => (
  <SettingsPageWrapper title={t`Support access`}>
    <PLUGIN_SUPPORT.SupportSettings />
    {/* render the outlet so that the grant-access modal route can show up */}
    <Outlet />
  </SettingsPageWrapper>
);
