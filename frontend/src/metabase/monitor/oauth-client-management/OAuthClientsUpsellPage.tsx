import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";
import { BaseUpsellPage } from "metabase/monitor/upsells";

export function OAuthClientsUpsellPage() {
  usePageTitle(t`OAuth clients`);

  return (
    <BaseUpsellPage
      campaign="oauth-client-management"
      location="monitor-oauth-clients-page"
      header={t`OAuth clients`}
      title={t`See which programs can act as your users, and cut one off`}
      description={t`Review every OAuth client registered against your instance, who connected it and how many live tokens it holds, then revoke the ones you do not want.`}
    />
  );
}
