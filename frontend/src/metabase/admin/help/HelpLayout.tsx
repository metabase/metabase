import { AdminSettingsLayout } from "metabase/admin/components/AdminLayout/AdminSettingsLayout";
import { Outlet, useLocation } from "metabase/router";
import * as Urls from "metabase/urls";

import { HelpAssistantChatProvider } from "./HelpAssistant";
import { HelpNav } from "./HelpNav";

export const HelpLayout = () => {
  const { pathname } = useLocation();
  const isAssistantPage = pathname.replace(/\/$/, "") === Urls.adminHelp();

  return (
    <HelpAssistantChatProvider>
      <AdminSettingsLayout sidebar={<HelpNav />} fullWidth={isAssistantPage}>
        <Outlet />
      </AdminSettingsLayout>
    </HelpAssistantChatProvider>
  );
};
