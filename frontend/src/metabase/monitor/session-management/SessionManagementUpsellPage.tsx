import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { BaseUpsellPage } from "metabase/monitor/upsells";

export function SessionManagementUpsellPage() {
  usePageTitle(t`Session management`);

  // Placeholder copy and campaign: whether this upsell ships is still undecided.
  return (
    <BaseUpsellPage
      campaign="session-management"
      location="monitor-session-management-page"
      header={t`Session management`}
      title={t`See who is signed in, and revoke access in one click`}
      description={t`Review every active session across your instance, then revoke a single session, all of a person's sessions, or everyone's at once.`}
    />
  );
}
