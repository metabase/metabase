import { AdminSettingsLayout } from "metabase/admin/components/AdminLayout/AdminSettingsLayout";
import { Outlet, useLocation } from "metabase/router";

import { HelpAssistantChatProvider } from "./HelpAssistant";
import { HelpNav } from "./HelpNav";
import { isHelpAssistantPath } from "./utils";

export const HelpLayout = () => {
  const { pathname } = useLocation();
  const isAssistantPage = isHelpAssistantPath(pathname);

  return (
    <HelpAssistantChatProvider>
      <AdminSettingsLayout sidebar={<HelpNav />} fullWidth={isAssistantPage}>
        <Outlet />
      </AdminSettingsLayout>
    </HelpAssistantChatProvider>
  );
};
