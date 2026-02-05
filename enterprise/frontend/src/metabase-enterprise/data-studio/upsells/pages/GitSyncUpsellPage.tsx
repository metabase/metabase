import { t } from "ttag";

import { usePageTitle } from "metabase/hooks/use-page-title";

import { RemoteSyncUpsellPage } from "./RemoteSyncUpsellPage";

export function GitSyncUpsellPage() {
  usePageTitle(t`Git sync`);

  return <RemoteSyncUpsellPage />;
}
