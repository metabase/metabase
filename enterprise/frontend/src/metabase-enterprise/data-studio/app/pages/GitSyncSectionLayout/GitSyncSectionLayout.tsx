import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { GitSyncUpsellPage } from "metabase-enterprise/data-studio/upsells";

export function GitSyncSectionLayout() {
  usePageTitle(t`Git sync`);
  const hasRemoteSyncFeature = useHasTokenFeature("remote_sync");

  if (!hasRemoteSyncFeature) {
    return <GitSyncUpsellPage />;
  }

  return null;
}
