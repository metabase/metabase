import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { BaseUpsellPage } from "metabase/monitor/upsells";

export function SessionManagementUpsellPage() {
  usePageTitle(t`Session management`);

  return (
    <BaseUpsellPage
      campaign="session-management"
      location="monitor-session-management-page"
      header={t`Session management`}
      title={t`Session management`}
      // eslint-disable-next-line metabase/no-literal-metabase-strings
      description={t`See who is signed in to your Metabase. Revoke individual sessions, all sessions for a single person, or all sessions for your Metabase.`}
    />
  );
}
